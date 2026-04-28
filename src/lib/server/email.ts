import { env } from '$env/dynamic/private';
import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = env.SENDGRID_API_KEY;
const FROM_EMAIL = env.EMAIL_FROM;

if (SENDGRID_API_KEY) {
	sgMail.setApiKey(SENDGRID_API_KEY);
}

export async function send_verification_email(email: string, url: string) {
	if (!SENDGRID_API_KEY) {
		console.warn('[Email] SENDGRID_API_KEY is not set. Email verification will not work.');
		console.info(`[Email] Verification URL for ${email}: ${url}`);
		return;
	}

	if (!FROM_EMAIL) {
		console.error('[Email] EMAIL_FROM is not set. SendGrid requires a verified sender email.');
		return;
	}

	try {
		const msg = {
			to: email,
			from: FROM_EMAIL,
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
	} catch (err: any) {
		console.error('[Email] SendGrid Error:', err.response?.body || err.message || err);
	}
}
