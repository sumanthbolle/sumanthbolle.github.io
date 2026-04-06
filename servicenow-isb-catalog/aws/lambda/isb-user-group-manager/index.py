"""
AWS Lambda: ISB User Group Manager
Manages IAM Identity Center (IDC) user group membership for the Innovation Sandbox.

Endpoints (via API Gateway):
  POST /user-group/add     - Add user to temaisb_UserGroup
  POST /user-group/remove  - Remove user from temaisb_UserGroup

Environment Variables:
  IDENTITY_STORE_ID  - IAM Identity Center Identity Store ID
  GROUP_NAME         - Target group name (default: temaisb_UserGroup)
  LOG_LEVEL          - Logging level (default: INFO)
"""

import json
import logging
import os
from typing import Any

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

identitystore = boto3.client("identitystore")

IDENTITY_STORE_ID = os.environ.get("IDENTITY_STORE_ID", "")
DEFAULT_GROUP_NAME = os.environ.get("GROUP_NAME", "temaisb_UserGroup")


def lambda_handler(event: dict, context: Any) -> dict:
    """Main Lambda handler. Routes based on the resource path."""
    logger.info("Received event: %s", json.dumps(event, default=str))

    try:
        path = event.get("resource", event.get("path", ""))
        http_method = event.get("httpMethod", "POST")
        body = json.loads(event.get("body", "{}")) if event.get("body") else {}

        user_email = body.get("userEmail", "")
        group_name = body.get("groupName", DEFAULT_GROUP_NAME)
        identity_store_id = body.get("identityStoreId", IDENTITY_STORE_ID)

        if not user_email:
            return _response(400, {"error": "userEmail is required"})

        if not identity_store_id:
            return _response(400, {"error": "identityStoreId is required"})

        if path.endswith("/add"):
            return _add_user_to_group(user_email, group_name, identity_store_id)
        elif path.endswith("/remove"):
            return _remove_user_from_group(user_email, group_name, identity_store_id)
        else:
            return _response(400, {"error": f"Unknown path: {path}"})

    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON in request body"})
    except Exception as e:
        logger.exception("Unhandled exception")
        return _response(500, {"error": str(e)})


def _add_user_to_group(
    user_email: str, group_name: str, identity_store_id: str
) -> dict:
    """Add user to the specified IAM Identity Center group."""
    user_id = _find_user_by_email(user_email, identity_store_id)
    if not user_id:
        return _response(404, {
            "error": f"User with email '{user_email}' not found in Identity Store"
        })

    group_id = _find_group_by_name(group_name, identity_store_id)
    if not group_id:
        return _response(404, {
            "error": f"Group '{group_name}' not found in Identity Store"
        })

    if _is_member(user_id, group_id, identity_store_id):
        logger.info("User %s is already a member of group %s", user_email, group_name)
        return _response(200, {
            "message": f"User '{user_email}' is already a member of '{group_name}'",
            "userId": user_id,
            "groupId": group_id,
            "alreadyMember": True,
        })

    try:
        resp = identitystore.create_group_membership(
            IdentityStoreId=identity_store_id,
            GroupId=group_id,
            MemberId={"UserId": user_id},
        )
        membership_id = resp.get("MembershipId", "")
        logger.info(
            "Added user %s to group %s, membership: %s",
            user_email, group_name, membership_id,
        )
        return _response(201, {
            "message": f"User '{user_email}' added to group '{group_name}'",
            "userId": user_id,
            "groupId": group_id,
            "membershipId": membership_id,
        })
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "ConflictException":
            return _response(409, {
                "message": f"User '{user_email}' is already a member of '{group_name}'",
                "alreadyMember": True,
            })
        raise


def _remove_user_from_group(
    user_email: str, group_name: str, identity_store_id: str
) -> dict:
    """Remove user from the specified IAM Identity Center group."""
    user_id = _find_user_by_email(user_email, identity_store_id)
    if not user_id:
        return _response(404, {
            "error": f"User with email '{user_email}' not found in Identity Store"
        })

    group_id = _find_group_by_name(group_name, identity_store_id)
    if not group_id:
        return _response(404, {
            "error": f"Group '{group_name}' not found in Identity Store"
        })

    membership_id = _get_membership_id(user_id, group_id, identity_store_id)
    if not membership_id:
        return _response(404, {
            "error": f"User '{user_email}' is not a member of group '{group_name}'"
        })

    try:
        identitystore.delete_group_membership(
            IdentityStoreId=identity_store_id,
            MembershipId=membership_id,
        )
        logger.info("Removed user %s from group %s", user_email, group_name)
        return _response(200, {
            "message": f"User '{user_email}' removed from group '{group_name}'",
            "userId": user_id,
            "groupId": group_id,
        })
    except ClientError as e:
        logger.exception("Failed to remove user from group")
        raise


def _find_user_by_email(email: str, identity_store_id: str) -> str | None:
    """Look up a user by email in Identity Store. Returns user ID or None."""
    try:
        resp = identitystore.list_users(
            IdentityStoreId=identity_store_id,
            Filters=[{
                "AttributePath": "UserName",
                "AttributeValue": email,
            }],
        )
        users = resp.get("Users", [])
        if users:
            return users[0]["UserId"]

        resp = identitystore.list_users(
            IdentityStoreId=identity_store_id,
            Filters=[{
                "AttributePath": "Emails.Value",
                "AttributeValue": email,
            }],
        )
        users = resp.get("Users", [])
        return users[0]["UserId"] if users else None
    except ClientError:
        logger.exception("Error looking up user %s", email)
        return None


def _find_group_by_name(group_name: str, identity_store_id: str) -> str | None:
    """Look up a group by display name. Returns group ID or None."""
    try:
        resp = identitystore.list_groups(
            IdentityStoreId=identity_store_id,
            Filters=[{
                "AttributePath": "DisplayName",
                "AttributeValue": group_name,
            }],
        )
        groups = resp.get("Groups", [])
        return groups[0]["GroupId"] if groups else None
    except ClientError:
        logger.exception("Error looking up group %s", group_name)
        return None


def _is_member(user_id: str, group_id: str, identity_store_id: str) -> bool:
    """Check if user is already a member of the group."""
    return _get_membership_id(user_id, group_id, identity_store_id) is not None


def _get_membership_id(
    user_id: str, group_id: str, identity_store_id: str
) -> str | None:
    """Get the membership ID if user is a member of the group."""
    try:
        resp = identitystore.get_group_membership_id(
            IdentityStoreId=identity_store_id,
            GroupId=group_id,
            MemberId={"UserId": user_id},
        )
        return resp.get("MembershipId")
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            return None
        raise


def _response(status_code: int, body: dict) -> dict:
    """Build an API Gateway proxy response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, default=str),
    }
