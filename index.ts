import express from 'express';
import bodyParser from 'body-parser';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
app.use(bodyParser.json());


type Contact = Awaited<ReturnType<typeof prisma.contact.findFirst>>;


function isContact(contact: Contact): contact is NonNullable<Contact> {
    return contact !== null;
}


app.post('/identify', async (req, res) => {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
        return res.status(400).json({ error: 'Email or phoneNumber is required.' });
    }

    const existingContacts: Contact[] = await prisma.contact.findMany({
        where: {
            OR: [
                email ? { email } : undefined,
                phoneNumber ? { phoneNumber } : undefined,
            ].filter(Boolean) as any
        },
        orderBy: {
            createdAt: 'asc'
        }
    });

    let primaryContact: Contact | null = null;

    if (existingContacts.length === 0) {
        primaryContact = await prisma.contact.create({
            data: {
                email,
                phoneNumber,
                linkPrecedence: 'primary'
            }
        });
    } else {
        primaryContact = existingContacts.find((c) => c?.linkPrecedence === 'primary') || existingContacts[0];

        const infoMismatch = existingContacts.every(
            (c) => c && ((email && c.email !== email) || (phoneNumber && c.phoneNumber !== phoneNumber))
        );

        if (primaryContact && infoMismatch) {
            await prisma.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkPrecedence: 'secondary',
                    linkedId: primaryContact.id
                }
            });
        }
    }

    if (!primaryContact) {
        return res.status(500).json({ error: 'Failed to create or retrieve primary contact.' });
    }

    const allContacts: Contact[] = await prisma.contact.findMany({
        where: {
            OR: [
                { id: primaryContact.id },
                { linkedId: primaryContact.id }
            ]
        }
    });

    const emails = Array.from(new Set(allContacts.map((c) => c?.email).filter((e): e is string => Boolean(e))));
    const phoneNumbers = Array.from(new Set(allContacts.map((c) => c?.phoneNumber).filter((p): p is string => Boolean(p))));
    const secondaryContactIds = allContacts
        .filter((c) => c?.linkPrecedence === 'secondary')
        .map((c) => c!.id);

    res.json({
        contact: {
            primaryContactId: primaryContact.id,
            emails,
            phoneNumbers,
            secondaryContactIds
        }
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


