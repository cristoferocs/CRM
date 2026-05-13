import nodemailer from "nodemailer";

export interface EmailChannelConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
}

export class EmailChannel {
    private readonly transporter: nodemailer.Transporter;

    constructor(private readonly config: EmailChannelConfig) {
        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: { user: config.user, pass: config.pass },
        });
    }

    async sendEmail(
        to: string,
        subject: string,
        text: string,
        html?: string,
        attachments?: { filename: string; path: string }[],
    ) {
        const info = await this.transporter.sendMail({
            from: `"${this.config.fromName}" <${this.config.user}>`,
            to,
            subject,
            text,
            html,
            attachments,
        });
        return { messageId: info.messageId };
    }

    async verify() {
        return this.transporter.verify();
    }
}

export function createEmailChannel(config: EmailChannelConfig) {
    return new EmailChannel(config);
}
