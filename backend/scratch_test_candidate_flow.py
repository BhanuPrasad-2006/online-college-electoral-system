import asyncio
import httpx

async def main():
    # Set timeout to 30 seconds to allow the backend to do background SMTP/SMS calls without timing out early
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000/api/v1", timeout=30.0) as client:
        # Step 1: Candidate Login
        payload = {
            "email": "1ds24cy021@dsce.edu.in",
            "mobile_number": "7892973474",
            "password": "bhanu@2006"
        }
        print("Sending Candidate Login Step 1 Request...")
        r1 = await client.post("/auth/candidate/login", json=payload)
        print("Status Code:", r1.status_code)
        res_data = r1.json()
        
        if r1.status_code != 200:
            print("Login step 1 failed.")
            return
            
        token = res_data["otp_session_token"]
        
        # Read initial SMS OTP (we will use this after email resend)
        import os
        sms_file = "latest_sms_otp.txt"
        if os.path.exists(sms_file):
            with open(sms_file, "r") as f:
                sms_otp = f.read().split(":")[-1].strip()
            print(f"Retrieved initial SMS OTP: {sms_otp}")
        else:
            print("SMS OTP file not found.")
            return

        # Step 2: Resend Email OTP (without verifying first, mimicking user clicking resend in the UI)
        print("\nTesting Resend Email OTP flow...")
        resend_payload = {
            "otp_session_token": token
        }
        r2 = await client.post("/auth/candidate/resend-email-otp", json=resend_payload)
        print("Resend Status Code:", r2.status_code)
        resend_data = r2.json()
        
        if r2.status_code != 200:
            print("Resend OTP failed.")
            return
            
        new_token = resend_data["otp_session_token"]
        
        # Read new email OTP
        otp_file = "latest_otp.txt"
        if os.path.exists(otp_file):
            with open(otp_file, "r") as f:
                new_email_otp = f.read().split(":")[-1].strip()
            print(f"Retrieved new Email OTP: {new_email_otp}")
        else:
            print("Email OTP file not found.")
            return
        
        # Step 3: Verify using new token, new email OTP, and original SMS OTP (both should be valid and unused)
        verify_payload = {
            "otp_session_token": new_token,
            "email_otp": new_email_otp,
            "sms_otp": sms_otp
        }
        print("Verifying with resent session token and original SMS OTP...")
        r3 = await client.post("/auth/candidate/verify-otp", json=verify_payload)
        print("Status Code:", r3.status_code)
        print("Response:", r3.json())

if __name__ == "__main__":
    asyncio.run(main())
