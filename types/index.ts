export interface IdentifyRequest{
    email?: string;
    phoneNumber?: string;
}

export interface ContactResponse{
    contact:{
        primaryContactId:number;
        emails : string[];
        phoneNumbers: string[];
        secondaryContactIds: number[];
    };
}

export interface Contact {
    id: number;
    phoneNumber: string | null;
    email: string | null;
    lindedId:number | null;
    linkprecedence: "primary" | "secondary";
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}