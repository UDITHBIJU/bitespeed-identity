import { Request, Response } from "express";
import { z } from "zod";
import { identifyContact } from "../services/identifyService";
const identifySchema = z
	.object({
		email: z.string().email().optional(),
		phoneNumber: z.string().optional(),
	})
	.refine((data) => data.email || data.phoneNumber, {
		message: "At least one of email or phoneNumber is required",
	});

export async function identify(req: Request, res: Response): Promise<void> {
	try {
		const { email, phoneNumber } = identifySchema.parse(req.body);
        const result = await identifyContact({ email, phoneNumber });

		res.status(200).json(result);
	} catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                error: "Invalid request data",
                details: error.errors,
            });
        } else {
           
            res.status(500).json({
                error: "Internal server error",
                message: error.message || "An unexpected error occurred",
            });
        }
	}
}
 