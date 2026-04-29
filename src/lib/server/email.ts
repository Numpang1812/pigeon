import { env } from '$env/dynamic/private';
import nodemailer from 'nodemailer';

const from_email = env.EMAIL_FROM;
const smtp_password = env.SMTP_PASSWORD;

// Create a reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
	service: 'gmail', // You can use 'gmail' which simplifies the config
	auth: {
		user: from_email,
		pass: smtp_password
	}
});

export async function send_verification_email(email: string, url: string) {
	if (!from_email || !smtp_password) {
		console.warn('[Email] EMAIL_FROM or SMTP_PASSWORD is not set. Email verification will not work.');
		console.info(`[Email] VERIFICATION URL FOR ${email}: ${url}`);
		return;
	}

	console.info(`[Email] Sending from: ${from_email}`);
	console.info(`[Email] VERIFICATION URL FOR ${email}: ${url}`);

	try {
		const info = await transporter.sendMail({
			from: `"Pigeon" <${from_email}>`,
			to: email,
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
		});

		console.info(`[Email] Nodemailer: Verification email sent successfully to ${email}. Message ID: ${info.messageId}`);
	} catch (error) {
		console.error('[Email] Nodemailer Error:', error);
	}
}

export async function send_verification_code(email: string, code: string) {
	if (!from_email || !smtp_password) {
		console.warn('[Email] Nodemailer not configured. Code:', code);
		console.info(`[Email] VERIFICATION CODE FOR ${email}: ${code}`);
		return;
	}

	console.info(`[Email] Sending from: ${from_email}`);
	console.info(`[Email] VERIFICATION CODE FOR ${email}: ${code}`);
	try {
		const info = await transporter.sendMail({
			from: `"Pigeon" <${from_email}>`,
			to: email,
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
		});

		console.info(`[Email] Nodemailer: Verification code sent to ${email}. Message ID: ${info.messageId}`);
	} catch (error) {
		console.error('[Email] Nodemailer Error:', error);
	}
}
