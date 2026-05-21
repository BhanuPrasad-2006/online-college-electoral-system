import os

file_path = "app/services/auth_service.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
old_imports = """import asyncio
import jwt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.admin_user import AdminUser"""

new_imports = """import asyncio
from datetime import timedelta, datetime, timezone
import jwt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.voter import Voter
from app.models.candidate import Candidate
from app.models.admin_user import AdminUser
from app.models.election import Election
from app.enums.election_status import ElectionStatusEnum"""

# 2. Helpers
old_helpers = """def _mask_mobile(mobile: str) -> str:
    return f"{'*' * 6}{mobile[-4:]}\""""

new_helpers = """def _mask_mobile(mobile: str) -> str:
    return f"{'*' * 6}{mobile[-4:]}"


async def _get_token_expiry_minutes(db: AsyncSession) -> int:
    \"\"\"
    Get token expiration minutes: 5 minutes if any election is in VOTING_OPEN status,
    15 minutes otherwise.
    \"\"\"
    try:
        result = await db.execute(
            select(Election).where(Election.status == ElectionStatusEnum.VOTING_OPEN)
        )
        voting_open_election = result.scalars().first()
        if voting_open_election:
            return 5
        return 15
    except Exception as e:
        logger.error(f"Error checking voting_open election status: {e}")
        return 15"""

# 3. Voter Login Step 1
old_voter_step1 = """    # Fire SMTP email sending in the background to ensure instant login response
    asyncio.create_task(
        send_otp_email(
            to_email=voter.college_email,
            recipient_name=voter.full_name,
            otp=email_otp,
            purpose="login",
        )
    )

    await db.commit()

    session_token = create_otp_session_token(
        voter_id=str(voter.voter_id),
        email=voter.college_email,
        otp_id=str(otp_record.otp_id),
    )

    return {
        "otp_session_token": session_token,
        "hint": f"OTP sent to {_mask_email(voter.college_email)}",
    }"""

new_voter_step1 = """    # Fire SMTP email sending in the background to ensure instant login response
    asyncio.create_task(
        send_otp_email(
            to_email=voter.college_email,
            recipient_name=voter.full_name,
            otp=email_otp,
            purpose="login",
        )
    )

    voter_id_str = str(voter.voter_id)
    college_email = voter.college_email
    otp_id_str = str(otp_record.otp_id)

    await db.commit()

    session_token = create_otp_session_token(
        voter_id=voter_id_str,
        email=college_email,
        otp_id=otp_id_str,
    )

    return {
        "otp_session_token": session_token,
        "hint": f"OTP sent to {_mask_email(college_email)}",
    }"""

# 4. Voter Login Step 2
old_voter_step2 = """    await db.commit()

    access_token = create_access_token(
        data={
            "sub": str(voter.voter_id),
            "role": UserRoleEnum.VOTER.value,
            "email": voter.college_email,
        }
    )

    # Trigger login security alert SMS if mobile number exists
    if voter.mobile_number:
        try:
            msg = "Security Alert: You have successfully logged in to CollegeVote. If this wasn't you, please secure your account or change your password immediately."
            asyncio.create_task(send_custom_sms(voter.mobile_number, msg))
        except Exception:
            pass

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": UserRoleEnum.VOTER.value,
        "user_id": str(voter.voter_id),
        "full_name": voter.full_name,
        "expires_in_seconds": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }"""

new_voter_step2 = """    voter_id_str = str(voter.voter_id)
    college_email = voter.college_email
    mobile_number = voter.mobile_number
    full_name = voter.full_name

    expiry_minutes = await _get_token_expiry_minutes(db)

    await db.commit()

    access_token = create_access_token(
        data={
            "sub": voter_id_str,
            "role": UserRoleEnum.VOTER.value,
            "email": college_email,
        },
        expires_delta=timedelta(minutes=expiry_minutes),
    )

    # Trigger login security alert SMS if mobile number exists
    if mobile_number:
        try:
            msg = "Security Alert: You have successfully logged in to CollegeVote. If this wasn't you, please secure your account or change your password immediately."
            asyncio.create_task(send_custom_sms(mobile_number, msg))
        except Exception:
            pass

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": UserRoleEnum.VOTER.value,
        "user_id": voter_id_str,
        "full_name": full_name,
        "expires_in_seconds": expiry_minutes * 60,
    }"""

# 5. Candidate Login Step 1 - Case 1 (Already Registered)
old_cand_step1_case1 = """        await db.commit()

        session_token = create_otp_session_token(
            voter_id=str(voter.voter_id),
            email=voter.college_email,
            otp_id=str(email_otp_record.otp_id),
            is_registered=True,
            mobile_number=candidate.mobile_number,
        )

        return {
            "otp_session_token": session_token,
            "hint": f"OTP sent to {_mask_email(voter.college_email)} and {_mask_mobile(candidate.mobile_number)}",
            "is_registered": True,
        }"""

new_cand_step1_case1 = """        voter_id_str = str(voter.voter_id)
        college_email = voter.college_email
        otp_id_str = str(email_otp_record.otp_id)
        cand_mobile = candidate.mobile_number

        await db.commit()

        session_token = create_otp_session_token(
            voter_id=voter_id_str,
            email=college_email,
            otp_id=otp_id_str,
            is_registered=True,
            mobile_number=cand_mobile,
        )

        return {
            "otp_session_token": session_token,
            "hint": f"OTP sent to {_mask_email(college_email)} and {_mask_mobile(cand_mobile)}",
            "is_registered": True,
        }"""

# 6. Candidate Login Step 1 - Case 2 (Not Registered)
old_cand_step1_case2 = """        await db.commit()

        session_token = create_otp_session_token(
            voter_id=str(voter.voter_id),
            email=voter.college_email,
            otp_id=str(email_otp_record.otp_id),
            is_registered=False,
            mobile_number=full_mobile,
        )

        return {
            "otp_session_token": session_token,
            "hint": f"Verification OTP sent to {_mask_email(voter.college_email)} and {_mask_mobile(full_mobile)}",
            "is_registered": False,
        }"""

new_cand_step1_case2 = """        voter_id_str = str(voter.voter_id)
        college_email = voter.college_email
        otp_id_str = str(email_otp_record.otp_id)

        await db.commit()

        session_token = create_otp_session_token(
            voter_id=voter_id_str,
            email=college_email,
            otp_id=otp_id_str,
            is_registered=False,
            mobile_number=full_mobile,
        )

        return {
            "otp_session_token": session_token,
            "hint": f"Verification OTP sent to {_mask_email(college_email)} and {_mask_mobile(full_mobile)}",
            "is_registered": False,
        }"""

# 7. Candidate Login Step 2
old_cand_step2 = """    await db.commit()

    # If is_registered is True, we have an existing candidate profile
    if is_registered:
        candidate_result = await db.execute(
            select(Candidate).where(Candidate.voter_id == voter_uuid)
        )
        candidate = candidate_result.scalars().first()
        if not candidate:
            raise InvalidCredentialsError("Candidate profile not found")

        candidate.mobile_verified = True
        await db.commit()

        # Access token sub is the candidate_id for registered candidates
        access_token = create_access_token(
            data={
                "sub": str(candidate.candidate_id),
                "role": UserRoleEnum.CANDIDATE.value,
                "email": voter.college_email,
            }
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": UserRoleEnum.CANDIDATE.value,
            "user_id": str(candidate.candidate_id),
            "full_name": voter.full_name,
            "expires_in_seconds": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "is_registered": True,
            "department": voter.department,
            "semester": str((voter.year_of_study * 2) - 1) if voter.year_of_study is not None else None,
        }
    else:
        # If not registered yet, we create a temporary registration JWT token!
        # Its role is still candidate, but is_registered is returned as False!
        # The frontend will receive this, see is_registered=False, and render the wizard using this JWT token!
        access_token = create_access_token(
            data={
                "sub": str(voter.voter_id),
                "role": UserRoleEnum.CANDIDATE.value,
                "email": voter.college_email,
                "temp_reg": True,
                "mobile_number": mobile_number,
            }
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": UserRoleEnum.CANDIDATE.value,
            "user_id": str(voter.voter_id),
            "full_name": voter.full_name,
            "expires_in_seconds": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "is_registered": False,
            "department": voter.department,
            "semester": str((voter.year_of_study * 2) - 1) if voter.year_of_study is not None else None,
            "mobile_number": mobile_number,
        }"""

new_cand_step2 = """    college_email = voter.college_email
    voter_id_str = str(voter.voter_id)
    full_name = voter.full_name
    department = voter.department
    year_of_study = voter.year_of_study

    candidate = None
    candidate_id_str = None
    if is_registered:
        candidate_result = await db.execute(
            select(Candidate).where(Candidate.voter_id == voter_uuid)
        )
        candidate = candidate_result.scalars().first()
        if not candidate:
            raise InvalidCredentialsError("Candidate profile not found")

        candidate_id_str = str(candidate.candidate_id)
        candidate.mobile_verified = True

    expiry_minutes = await _get_token_expiry_minutes(db)

    await db.commit()

    # If is_registered is True, we have an existing candidate profile
    if is_registered:
        # Access token sub is the candidate_id for registered candidates
        access_token = create_access_token(
            data={
                "sub": candidate_id_str,
                "role": UserRoleEnum.CANDIDATE.value,
                "email": college_email,
            },
            expires_delta=timedelta(minutes=expiry_minutes),
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": UserRoleEnum.CANDIDATE.value,
            "user_id": candidate_id_str,
            "full_name": full_name,
            "expires_in_seconds": expiry_minutes * 60,
            "is_registered": True,
            "department": department,
            "semester": str((year_of_study * 2) - 1) if year_of_study is not None else None,
        }
    else:
        # If not registered yet, we create a temporary registration JWT token!
        # Its role is still candidate, but is_registered is returned as False!
        # The frontend will receive this, see is_registered=False, and render the wizard using this JWT token!
        access_token = create_access_token(
            data={
                "sub": voter_id_str,
                "role": UserRoleEnum.CANDIDATE.value,
                "email": college_email,
                "temp_reg": True,
                "mobile_number": mobile_number,
            },
            expires_delta=timedelta(minutes=expiry_minutes),
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": UserRoleEnum.CANDIDATE.value,
            "user_id": voter_id_str,
            "full_name": full_name,
            "expires_in_seconds": expiry_minutes * 60,
            "is_registered": False,
            "department": department,
            "semester": str((year_of_study * 2) - 1) if year_of_study is not None else None,
            "mobile_number": mobile_number,
        }"""

# 8. Admin Login Step 1
old_admin_step1 = """    await db.commit()

    # 4. Generate OTP session token
    from datetime import datetime, timedelta, timezone
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": str(admin.admin_id),
        "email": admin.email,
        "mobile": mobile_number,
        "type": "otp_session",
        "exp": expire,
    }"""

new_admin_step1 = """    admin_id_str = str(admin.admin_id)
    admin_email = admin.email

    await db.commit()

    # 4. Generate OTP session token
    from datetime import datetime, timezone
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": admin_id_str,
        "email": admin_email,
        "mobile": mobile_number,
        "type": "otp_session",
        "exp": expire,
    }"""

# 9. Admin Login Step 2
old_admin_step2 = """    await db.commit()

    # Generate Access JWT Token for Admin
    access_token = create_access_token(
        data={
            "sub": str(admin.admin_id),
            "role": "admin",
            "email": admin.email,
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": "admin",
        "user_id": str(admin.admin_id),
        "full_name": admin.full_name,
        "expires_in_seconds": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }"""

new_admin_step2 = """    admin_id_str = str(admin.admin_id)
    admin_email = admin.email
    full_name = admin.full_name

    expiry_minutes = await _get_token_expiry_minutes(db)

    await db.commit()

    # Generate Access JWT Token for Admin
    access_token = create_access_token(
        data={
            "sub": admin_id_str,
            "role": "admin",
            "email": admin_email,
        },
        expires_delta=timedelta(minutes=expiry_minutes),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": "admin",
        "user_id": admin_id_str,
        "full_name": full_name,
        "expires_in_seconds": expiry_minutes * 60,
    }"""

# 10. Request Password Change OTP
old_pwd_change = """    await db.commit()

    # 5. Generate OTP session token containing hashed new password!
    new_hash = hash_password(new_password)
    from datetime import datetime, timezone, timedelta
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": voter_id,
        "email": voter.college_email,
        "new_password_hash": new_hash,
        "type": "password_change_session",
        "exp": expire,
    }"""

new_pwd_change = """    college_email = voter.college_email

    await db.commit()

    # 5. Generate OTP session token containing hashed new password!
    new_hash = hash_password(new_password)
    from datetime import datetime, timezone
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": voter_id,
        "email": college_email,
        "new_password_hash": new_hash,
        "type": "password_change_session",
        "exp": expire,
    }"""

# 11. Resend Voter OTP
old_resend_voter = """    await db.commit()

    # Generate a fresh session token
    new_session_token = create_otp_session_token(
        voter_id=str(voter.voter_id),
        email=voter.college_email,
        otp_id=str(otp_record.otp_id),
    )

    return {
        "message": "OTP has been successfully resent to your registered email address.",
        "otp_session_token": new_session_token,
        "hint": f"OTP resent to {_mask_email(voter.college_email)}",
    }"""

new_resend_voter = """    voter_id_str = str(voter.voter_id)
    college_email = voter.college_email
    otp_id_str = str(otp_record.otp_id)

    await db.commit()

    # Generate a fresh session token
    new_session_token = create_otp_session_token(
        voter_id=voter_id_str,
        email=college_email,
        otp_id=otp_id_str,
    )

    return {
        "message": "OTP has been successfully resent to your registered email address.",
        "otp_session_token": new_session_token,
        "hint": f"OTP resent to {_mask_email(college_email)}",
    }"""

# 12. Resend Candidate OTP
old_resend_cand = """    await db.commit()

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=str(candidate.voter_id),
        email=voter.college_email,
        otp_id=str(email_otp_record.otp_id),
        is_registered=True,
        mobile_number=candidate.mobile_number,
    )

    return {
        "message": "OTP has been successfully resent to your registered email and mobile number.",
        "otp_session_token": new_session_token,
        "hint": (
            f"OTP sent to {_mask_email(voter.college_email)} "
            f"and {_mask_mobile(candidate.mobile_number)}"
        ),
    }"""

new_resend_cand = """    voter_id_str = str(candidate.voter_id)
    college_email = voter.college_email
    otp_id_str = str(email_otp_record.otp_id)
    mobile_num = candidate.mobile_number

    await db.commit()

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=voter_id_str,
        email=college_email,
        otp_id=otp_id_str,
        is_registered=True,
        mobile_number=mobile_num,
    )

    return {
        "message": "OTP has been successfully resent to your registered email and mobile number.",
        "otp_session_token": new_session_token,
        "hint": (
            f"OTP sent to {_mask_email(college_email)} "
            f"and {_mask_mobile(mobile_num)}"
        ),
    }"""

# 13. Resend Candidate Email OTP
old_resend_cand_email = """    await db.commit()

    # Get values from old payload to preserve registration wizard context
    is_registered = payload.get("is_registered", False)
    mobile_number = payload.get("mobile_number")

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=str(voter.voter_id),
        email=voter.college_email,
        otp_id=str(email_otp_record.otp_id),
        is_registered=is_registered,
        mobile_number=mobile_number,
    )

    return {
        "message": "OTP has been successfully resent to your registered email.",
        "otp_session_token": new_session_token,
        "hint": f"OTP sent to {_mask_email(voter.college_email)}",
    }"""

new_resend_cand_email = """    voter_id_str = str(voter.voter_id)
    college_email = voter.college_email
    otp_id_str = str(email_otp_record.otp_id)

    await db.commit()

    # Get values from old payload to preserve registration wizard context
    is_registered = payload.get("is_registered", False)
    mobile_number = payload.get("mobile_number")

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=voter_id_str,
        email=college_email,
        otp_id=otp_id_str,
        is_registered=is_registered,
        mobile_number=mobile_number,
    )

    return {
        "message": "OTP has been successfully resent to your registered email.",
        "otp_session_token": new_session_token,
        "hint": f"OTP sent to {_mask_email(college_email)}",
    }"""

# 14. Resend Candidate SMS OTP
old_resend_cand_sms = """    await db.commit()

    # Get values from old payload to preserve registration wizard context
    is_registered = payload.get("is_registered", False)
    mobile_number = payload.get("mobile_number")

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=str(candidate.voter_id),
        email=voter.college_email,
        otp_id=str(sms_otp_record.otp_id),
        is_registered=is_registered,
        mobile_number=mobile_number,
    )

    return {
        "message": "OTP has been successfully resent to your registered mobile number.",
        "otp_session_token": new_session_token,
        "hint": f"OTP sent to {_mask_mobile(candidate.mobile_number)}",
    }"""

new_resend_cand_sms = """    voter_id_str = str(candidate.voter_id)
    college_email = voter.college_email
    otp_id_str = str(sms_otp_record.otp_id)
    cand_mobile = candidate.mobile_number

    await db.commit()

    # Get values from old payload to preserve registration wizard context
    is_registered = payload.get("is_registered", False)
    mobile_number = payload.get("mobile_number")

    # Generate new token
    new_session_token = create_otp_session_token(
        voter_id=voter_id_str,
        email=college_email,
        otp_id=otp_id_str,
        is_registered=is_registered,
        mobile_number=mobile_number,
    )

    return {
        "message": "OTP has been successfully resent to your registered mobile number.",
        "otp_session_token": new_session_token,
        "hint": f"OTP sent to {_mask_mobile(cand_mobile)}",
    }"""

# Execute replacements in order
replacements = [
    (old_imports, new_imports),
    (old_helpers, new_helpers),
    (old_voter_step1, new_voter_step1),
    (old_voter_step2, new_voter_step2),
    (old_cand_step1_case1, new_cand_step1_case1),
    (old_cand_step1_case2, new_cand_step1_case2),
    (old_cand_step2, new_cand_step2),
    (old_admin_step1, new_admin_step1),
    (old_admin_step2, new_admin_step2),
    (old_pwd_change, new_pwd_change),
    (old_resend_voter, new_resend_voter),
    (old_resend_cand, new_resend_cand),
    (old_resend_cand_email, new_resend_cand_email),
    (old_resend_cand_sms, new_resend_cand_sms),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f"REPLACED successfully!")
    else:
        # Check if helper check failed due to double quote or single quote differences
        print(f"FAILED to find target text starting with: {old[:50].strip()}")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done patching.")
