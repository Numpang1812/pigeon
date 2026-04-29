import { env } from '$env/dynamic/private';
import sgMail from '@sendgrid/mail';

const sendgrid_api_key = env.SENDGRID_API_KEY;
const from_email = env.EMAIL_FROM;

if (sendgrid_api_key) {
	sgMail.setApiKey(sendgrid_api_key);
}

export async function send_verification_email(email: string, url: string) {
	if (!sendgrid_api_key) {
		console.warn('[Email] SENDGRID_API_KEY is not set. Email verification will not work.');
		console.info(`[Email] Verification URL for ${email}: ${url}`);
		return;
	}

	if (!from_email) {
		console.error('[Email] EMAIL_FROM is not set. SendGrid requires a verified sender email.');
		return;
	}

	try {
		const msg = {
			to: email,
			from: from_email,
			subject: 'Verify your email address',
			html: `
				<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e8ed; border-radius: 12px;">
					<h1 style="color: #1da1f2; margin-bottom: 24px;">Welcome to Pigeon!</h1>
					<p style="font-size: 16px; color: #14171a; line-height: 1.5;">
						Thanks for joining Pigeon. To get started, please verify your email address by clicking the button below:
					</p>
					<div style="margin: 32px 0; text-align: center;">
						<a href="${url}" style="background-color: #1da1f2; color: white; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-weight: bold; display: inline-block;">
							Verify Email Address
						</a>
					</div>
					<p style="font-size: 14px; color: #657786; line-height: 1.5;">
						If you did not sign up for Pigeon, you can safely ignore this email.
					</p>
					<hr style="border: 0; border-top: 1px solid #e1e8ed; margin: 24px 0;" />
					<p style="font-size: 12px; color: #aab8c2; text-align: center;">
						Pigeon &bull; minimalist microblogging
					</p>
				</div>
			`
		};

		await sgMail.send(msg);
		console.info(`[Email] SendGrid: Verification email sent successfully to ${email}`);
	} catch (err: unknown) {
		const error = err as { response?: { body?: unknown }; message?: string };
		console.error('[Email] SendGrid Error:', error.response?.body || error.message || error);
	}
}

export async function send_verification_code(email: string, code: string) {
	if (!sendgrid_api_key || !from_email) {
		console.warn('[Email] SendGrid not configured. Code:', code);
		return;
	}

	try {
		const msg = {
			to: email,
			from: from_email,
			subject: `${code} is your Pigeon verification code`,
			html: `
				<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e8ed; border-radius: 12px;">
					<h1 style="color: #1da1f2; margin-bottom: 24px;">Verify your email</h1>
					<p style="font-size: 16px; color: #14171a; line-height: 1.5;">
						Use the following 6-digit code to verify your email address on Pigeon. This code will expire in 10 minutes.
					</p>
					<div style="margin: 32px 0; text-align: center;">
						<div style="background-color: #f8f9fa; color: #1da1f2; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px; border-radius: 8px; display: inline-block; border: 1px dashed #cbd5e1;">
							${code}
						</div>
					</div>
					<p style="font-size: 14px; color: #657786; line-height: 1.5;">
						If you did not request this code, you can safely ignore this email.
					</p>
					<hr style="border: 0; border-top: 1px solid #e1e8ed; margin: 24px 0;" />
					<p style="font-size: 12px; color: #aab8c2; text-align: center;">
						Pigeon &bull; minimalist microblogging
					</p>
				</div>
			`
		};

		await sgMail.send(msg);
		console.info(`[Email] SendGrid: Verification code sent to ${email}`);
	} catch (err: unknown) {
		const error = err as { response?: { body?: unknown }; message?: string };
		console.error('[Email] SendGrid Error:', error.response?.body || error.message || error);
	}
}
