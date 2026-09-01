"""Email delivery helpers for FinTrackr OTP flows.

Public API
----------
deliver_signup_otp(email, otp)   — sends account-verification OTP
deliver_reset_otp(email, otp)    — sends password-reset OTP

Both functions are no-ops (log only) when SMTP is not configured.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTML builders
# ---------------------------------------------------------------------------


def _build_signup_otp_email_html(recipient: str, otp: str) -> str:
    expiry_minutes = settings.SIGNUP_OTP_EXPIRY_MINUTES
    return f"""<!doctype html>
<html>
<head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
    <title>Verify your FinTrackr account</title>
    <style>
        @media only screen and (max-width: 620px) {{
            .email-shell {{
                width: 100% !important;
            }}

            .email-header {{
                padding: 14px 16px !important;
            }}

            .email-body {{
                padding: 20px 16px !important;
                font-size: 15px !important;
            }}

            .brand-logo {{
                height: 32px !important;
            }}

            .name-logo {{
                height: 25px !important;
            }}

            .otp-value {{
                font-size: 34px !important;
                letter-spacing: 4px !important;
            }}
        }}

        @media only screen and (max-width: 420px) {{
            .email-body {{
                padding: 18px 12px !important;
            }}

            .otp-value {{
                font-size: 30px !important;
                letter-spacing: 2px !important;
            }}

            .brand-logo {{
                height: 28px !important;
            }}

            .name-logo {{
                height: 22px !important;
            }}
        }}
    </style>
</head>
<body style=\"margin:0;padding:24px 12px;background:#eef3f9;\">
    <table
        width=\"100%\"
        role=\"presentation\"
        cellspacing=\"0\"
        cellpadding=\"0\"
    >
        <tr>
            <td align=\"center\">
                <table
                    width=\"100%\"
                    class=\"email-shell\"
                    role=\"presentation\"
                    cellspacing=\"0\"
                    cellpadding=\"0\"
                    style=\"max-width:620px;background:#ffffff;border:1px solid #d7e0ea;border-radius:12px;\"
                >
                    <tr>
                        <td
                            class=\"email-header\"
                            style=\"padding:16px 20px;background:#1b3774;border-bottom:4px solid #1d9e5f;border-radius:12px 12px 0 0;\"
                        >
                            <table
                                width=\"100%\"
                                role=\"presentation\"
                                cellspacing=\"0\"
                                cellpadding=\"0\"
                            >
                                <tr>
                                    <td align=\"left\" style=\"width:40%;\">
                                        <img
                                            class=\"brand-logo\"
                                            src="https://fintrackr.harpytechco.in/assets/app_logo.png"
                                            alt=\"FinTrackr Brand Logo\"
                                            style=\"display:block;height:36px;width:auto;\"
                                        />
                                    </td>
                                    <td align=\"right\" style=\"width:60%;\">
                                        <img
                                            class=\"name-logo\"
                                            src=\"https://fintrackr.harpytechco.in/assets/name_logo.svg\"
                                            alt=\"FinTrackr Name Logo\"
                                            style=\"display:inline-block;height:30px;width:auto;\"
                                        />
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td
                            class=\"email-body\"
                            style=\"padding:26px 24px 24px 24px;font:16px/1.55 Arial,Helvetica,sans-serif;color:#1f2b3a;\"
                        >
                            <p style=\"margin:0 0 14px 0;color:#13213a;\">
                                Hello {recipient},
                            </p>
                            <p style=\"margin:0 0 14px 0;color:#2f3f53;\">
                                You received this email because a verification request was made for your
                                FinTrackr account.
                            </p>
                            <table
                                width=\"100%\"
                                role=\"presentation\"
                                cellspacing=\"0\"
                                cellpadding=\"0\"
                                style=\"margin:0 0 16px 0;background:#f4f8ff;border:1px solid #dbe8ff;border-left:4px solid #1d9e5f;border-radius:8px;\"
                            >
                                <tr>
                                    <td style=\"padding:14px 14px 6px 14px;color:#2e4569;font-size:14px;\">
                                        <strong>Your OTP is:</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td
                                        class=\"otp-value\"
                                        style=\"padding:0 14px 6px 14px;color:#214fba;font-size:40px;line-height:1.05;font-weight:800;letter-spacing:6px;\"
                                    >
                                        {otp}
                                    </td>
                                </tr>
                                <tr>
                                    <td style=\"padding:0 14px 14px 14px;color:#4f5f73;font-size:13px;\">
                                        This OTP expires in {expiry_minutes} minutes.
                                    </td>
                                </tr>
                            </table>
                            <p style=\"margin:0 0 16px 0;color:#435366;\">
                                If you did not initiate this request, please ignore this email.
                            </p>
                            <p style=\"margin:0 0 8px 0;color:#1f2b3a;\">Thanks &amp; Regards,</p>
                            <p style=\"margin:0;color:#1b3774;font-weight:700;\">Support Team</p>
                            <p style=\"margin:6px 0 0 0;color:#1d9e5f;font-size:13px;font-weight:700;\">
                                FinTrackr
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""


def _build_reset_otp_email_html(recipient: str, otp: str) -> str:
    expiry_minutes = settings.SIGNUP_OTP_EXPIRY_MINUTES
    return f"""<!doctype html>
<html>
<head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
    <title>Reset your FinTrackr password</title>
    <style>
        @media only screen and (max-width: 620px) {{
            .email-shell {{ width: 100% !important; }}
            .email-header {{ padding: 14px 16px !important; }}
            .email-body {{ padding: 20px 16px !important; font-size: 15px !important; }}
            .brand-logo {{ height: 32px !important; }}
            .name-logo {{ height: 25px !important; }}
            .otp-value {{ font-size: 34px !important; letter-spacing: 4px !important; }}
        }}
        @media only screen and (max-width: 420px) {{
            .email-body {{ padding: 18px 12px !important; }}
            .otp-value {{ font-size: 30px !important; letter-spacing: 2px !important; }}
            .brand-logo {{ height: 28px !important; }}
            .name-logo {{ height: 22px !important; }}
        }}
    </style>
</head>
<body style=\"margin:0;padding:24px 12px;background:#eef3f9;\">
    <table width=\"100%\" role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\">
        <tr>
            <td align=\"center\">
                <table width=\"100%\" class=\"email-shell\" role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\"
                    style=\"max-width:620px;background:#ffffff;border:1px solid #d7e0ea;border-radius:12px;\">
                    <tr>
                        <td class=\"email-header\"
                            style=\"padding:16px 20px;background:#1b3774;border-bottom:4px solid #1d9e5f;border-radius:12px 12px 0 0;\">
                            <table width=\"100%\" role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\">
                                <tr>
                                    <td align=\"left\" style=\"width:40%;\">
                                        <img class=\"brand-logo\"
                                            src=\"https://fintrackr.harpytechco.in/assets/app_logo.png\"
                                            alt=\"FinTrackr Brand Logo\"
                                            style=\"display:block;height:36px;width:auto;\" />
                                    </td>
                                    <td align=\"right\" style=\"width:60%;\">
                                        <img class=\"name-logo\"
                                            src=\"https://fintrackr.harpytechco.in/assets/name_logo.svg\"
                                            alt=\"FinTrackr Name Logo\"
                                            style=\"display:inline-block;height:30px;width:auto;\" />
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td class=\"email-body\"
                            style=\"padding:26px 24px 24px 24px;font:16px/1.55 Arial,Helvetica,sans-serif;color:#1f2b3a;\">
                            <p style=\"margin:0 0 14px 0;color:#13213a;\">Hello {recipient},</p>
                            <p style=\"margin:0 0 14px 0;color:#2f3f53;\">
                                We received a request to reset the password for your FinTrackr account.
                                Use the OTP below to set a new password.
                            </p>
                            <table width=\"100%\" role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\"
                                style=\"margin:0 0 16px 0;background:#f4f8ff;border:1px solid #dbe8ff;border-left:4px solid #e05b00;border-radius:8px;\">
                                <tr>
                                    <td style=\"padding:14px 14px 6px 14px;color:#2e4569;font-size:14px;\">
                                        <strong>Your password reset OTP is:</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td class=\"otp-value\"
                                        style=\"padding:0 14px 6px 14px;color:#c24200;font-size:40px;line-height:1.05;font-weight:800;letter-spacing:6px;\">
                                        {otp}
                                    </td>
                                </tr>
                                <tr>
                                    <td style=\"padding:0 14px 14px 14px;color:#4f5f73;font-size:13px;\">
                                        This OTP expires in {expiry_minutes} minutes.
                                    </td>
                                </tr>
                            </table>
                            <p style=\"margin:0 0 16px 0;color:#435366;\">
                                If you did not request a password reset, please ignore this email.
                                Your password will remain unchanged.
                            </p>
                            <p style=\"margin:0 0 8px 0;color:#1f2b3a;\">Thanks &amp; Regards,</p>
                            <p style=\"margin:0;color:#1b3774;font-weight:700;\">Support Team</p>
                            <p style=\"margin:6px 0 0 0;color:#1d9e5f;font-size:13px;font-weight:700;\">FinTrackr</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Shared SMTP transport
# ---------------------------------------------------------------------------


def _smtp_send(message: EmailMessage) -> None:
    """Connect to the configured SMTP server and send *message*.

    Raises RuntimeError on connection failures or delivery errors so callers
    get a uniform exception type regardless of the underlying smtplib exception.
    """
    smtp_client = smtplib.SMTP_SSL if settings.SMTP_USE_SSL else smtplib.SMTP
    try:
        with smtp_client(
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            timeout=settings.SMTP_TIMEOUT_SECONDS,
        ) as server:
            if not settings.SMTP_USE_SSL:
                server.ehlo()
                if settings.SMTP_USE_TLS:
                    if not server.has_extn("STARTTLS"):
                        raise RuntimeError(
                            "SMTP server does not support STARTTLS. "
                            "Disable SMTP_USE_TLS or use a TLS-capable server."
                        )
                    server.starttls()
                    server.ehlo()

            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)

            server.send_message(message)
    except TimeoutError as exc:
        mode = "ssl" if settings.SMTP_USE_SSL else "plain/starttls"
        raise RuntimeError(
            "SMTP connection timed out or was closed by server. "
            f"host={settings.SMTP_HOST} "
            f"port={settings.SMTP_PORT} "
            f"mode={mode}."
        ) from exc
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError("Failed to send email via SMTP") from exc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def deliver_signup_otp(email: str, otp: str) -> None:
    """Send the signup verification OTP to *email*.

    Falls back to a console warning when SMTP is not configured.
    """
    subject = "Verify your FinTrackr account"
    body = (
        "Your FinTrackr verification code is: "
        f"{otp}. "
        "This code expires in "
        f"{settings.SIGNUP_OTP_EXPIRY_MINUTES} minutes."
    )

    if not settings.SMTP_HOST:
        logger.warning(
            "SMTP is not configured. OTP for %s is %s (development fallback).",
            email,
            otp,
        )
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = email
    if settings.SMTP_BCC_EMAILS:
        message["Bcc"] = ", ".join(settings.SMTP_BCC_EMAILS)
    message.set_content(body)
    message.add_alternative(
        _build_signup_otp_email_html(email, otp),
        subtype="html",
    )

    try:
        _smtp_send(message)
        logger.info("Verification OTP email sent to %s", email)
    except RuntimeError:
        logger.error(
            "Failed to send OTP email to %s",
            email,
            exc_info=True,
        )
        raise RuntimeError("Failed to send verification email")


def deliver_reset_otp(email: str, otp: str) -> None:
    """Send the password-reset OTP to *email*.

    Falls back to a console warning when SMTP is not configured.
    """
    subject = "Reset your FinTrackr password"
    body = (
        "Your FinTrackr password reset code is: "
        f"{otp}. "
        "This code expires in "
        f"{settings.SIGNUP_OTP_EXPIRY_MINUTES} minutes. "
        "If you did not request this, please ignore this email."
    )

    if not settings.SMTP_HOST:
        logger.warning(
            "SMTP is not configured. Password reset OTP for %s is %s (development fallback).",
            email,
            otp,
        )
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.SMTP_FROM_EMAIL
    message["To"] = email
    if settings.SMTP_BCC_EMAILS:
        message["Bcc"] = ", ".join(settings.SMTP_BCC_EMAILS)
    message.set_content(body)
    message.add_alternative(_build_reset_otp_email_html(email, otp), subtype="html")

    try:
        _smtp_send(message)
        logger.info("Password reset OTP email sent to %s", email)
    except RuntimeError:
        logger.error(
            "Failed to send reset OTP email to %s",
            email,
            exc_info=True,
        )
        raise RuntimeError("Failed to send password reset email")
