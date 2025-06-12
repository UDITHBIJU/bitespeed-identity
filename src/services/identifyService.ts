import { IdentifyRequest, ContactResponse, Contact } from "../types/index";
import { Response } from "express";
import prisma from "../../prisma/client";
import { Prisma } from "@prisma/client";

// Helper function to ensure linkPrecedence is properly typed
function ensureContact(contact: any): Contact {
	return {
		...contact,
		linkPrecedence:
			(contact.linkPrecedence as "primary" | "secondary") || "primary",
	};
}

export async function identifyContact({
	email,
	phoneNumber,
}: IdentifyRequest): Promise<ContactResponse> {
	return prisma.$transaction(async (tx) => {
		// Find matching contacts
		const contacts = await tx.contact.findMany({
			where: {
				OR: [
					{ email: email || undefined },
					{ phoneNumber: phoneNumber || undefined },
				],
				deletedAt: null,
			},
		});

		// No matching contacts, create a new one
		if (contacts.length === 0) {
			const newContact = await tx.contact.create({
				data: {
					email,
					phoneNumber,
					linkPrecedence: "primary",
				},
			});

			return {
				contact: {
					primaryContactId: newContact.id,
					emails: newContact.email ? [newContact.email] : [],
					phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
					secondaryContactIds: [],
				},
			};
		}

		// Convert database contacts to Contact type
		const typedContacts = contacts.map(ensureContact);

		// Find all related contacts (including those linked to the found contacts)
		const allRelatedContactIds = new Set<number>();
		const contactsToProcess = [...typedContacts];

		// Add all found contacts to the set
		typedContacts.forEach((c) => allRelatedContactIds.add(c.id));

		// Find all contacts linked to the found contacts
		while (contactsToProcess.length > 0) {
			const contact = contactsToProcess.shift()!;

			// If this contact is secondary, find its primary
			if (contact.linkPrecedence === "secondary" && contact.linkedId) {
				if (!allRelatedContactIds.has(contact.linkedId)) {
					const linkedContact = await tx.contact.findUnique({
						where: { id: contact.linkedId, deletedAt: null },
					});
					if (linkedContact) {
						const typedLinkedContact = ensureContact(linkedContact);
						allRelatedContactIds.add(typedLinkedContact.id);
						contactsToProcess.push(typedLinkedContact);
						typedContacts.push(typedLinkedContact);
					}
				}
			}

			// If this contact is primary, find all its secondaries
			if (contact.linkPrecedence === "primary") {
				const secondaryContacts = await tx.contact.findMany({
					where: {
						linkedId: contact.id,
						deletedAt: null,
					},
				});

				for (const secondaryContact of secondaryContacts) {
					if (!allRelatedContactIds.has(secondaryContact.id)) {
						const typedSecondaryContact = ensureContact(secondaryContact);
						allRelatedContactIds.add(typedSecondaryContact.id);
						typedContacts.push(typedSecondaryContact);
					}
				}
			}
		}

		// Separate primary and secondary contacts
		const primaryContacts = typedContacts.filter(
			(c) => c.linkPrecedence === "primary"
		);
		const secondaryContacts = typedContacts.filter(
			(c) => c.linkPrecedence === "secondary"
		);

		// Determine the main primary contact (oldest one)
		let mainPrimaryContact = primaryContacts.reduce((oldest, current) =>
			current.createdAt < oldest.createdAt ? current : oldest
		);

		// If we have multiple primary contacts, convert all but the oldest to secondary
		if (primaryContacts.length > 1) {
			for (const contact of primaryContacts) {
				if (contact.id !== mainPrimaryContact.id) {
					await tx.contact.update({
						where: { id: contact.id },
						data: {
							linkPrecedence: "secondary",
							linkedId: mainPrimaryContact.id,
							updatedAt: new Date(),
						},
					});
					// Add to secondary contacts for response building
					secondaryContacts.push({
						...contact,
						linkPrecedence: "secondary",
						linkedId: mainPrimaryContact.id,
					});
				}
			}
		}

		// Check if we need to create a new contact with additional info
		const allContacts = [mainPrimaryContact, ...secondaryContacts];

		const hasExactMatch = allContacts.some(
			(c) => c.email === email && c.phoneNumber === phoneNumber
		);

		const hasNewInfo =
			(email && !allContacts.some((c) => c.email === email)) ||
			(phoneNumber && !allContacts.some((c) => c.phoneNumber === phoneNumber));

		if (hasNewInfo && !hasExactMatch) {
			const dbNewContact = await tx.contact.create({
				data: {
					email,
					phoneNumber,
					linkPrecedence: "secondary",
					linkedId: mainPrimaryContact.id,
				},
			});
			const newContact = ensureContact(dbNewContact);
			secondaryContacts.push(newContact);
		}

		// Build response - collect all unique emails and phone numbers
		const allResponseContacts = [mainPrimaryContact, ...secondaryContacts];

		const emails = Array.from(
			new Set(
				allResponseContacts
					.map((c) => c.email)
					.filter((email): email is string => email !== null)
			)
		);

		const phoneNumbers = Array.from(
			new Set(
				allResponseContacts
					.map((c) => c.phoneNumber)
					.filter((phoneNumber): phoneNumber is string => phoneNumber !== null)
			)
		);

		const secondaryContactIds = Array.from(
			new Set(secondaryContacts.map((c) => c.id))
		);

		return {
			contact: {
				primaryContactId: mainPrimaryContact.id,
				emails,
				phoneNumbers,
				secondaryContactIds,
			},
		};
	});
}
