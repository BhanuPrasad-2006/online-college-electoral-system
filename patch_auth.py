import re

path = 'backend/app/routes/auth.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports
content = content.replace('from fastapi import APIRouter, Depends, status, HTTPException', 'from fastapi import APIRouter, Depends, status, HTTPException, Request\nfrom app.middleware.rate_limit import limiter')

# Define routes to limit
routes_to_limit = [
    ('async def voter_login(', '/voter/login'),
    ('async def candidate_login(', '/candidate/login'),
    ('async def admin_login(', '/admin/login'),
    ('async def request_password_change(', '/change-password/request'),
    ('async def forgot_password_request_route(', '/forgot-password/request'),
    ('async def voter_resend_otp_route(', '/voter/resend-otp'),
    ('async def candidate_resend_otp_route(', '/candidate/resend-otp'),
    ('async def candidate_resend_email_otp_route(', '/candidate/resend-email-otp'),
    ('async def candidate_resend_sms_otp_route(', '/candidate/resend-sms-otp'),
]

for func_sig, route_path in routes_to_limit:
    # Find the router decorator for this function
    # It might have multiple lines, so we just find the function signature
    # and insert @limiter.limit("3/minute") before it
    
    new_func_sig = f'@limiter.limit("3/minute")\n{func_sig}\n    request: Request,'
    content = content.replace(func_sig, new_func_sig)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Patched auth.py successfully.')
