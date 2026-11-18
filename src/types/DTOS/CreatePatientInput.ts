export interface CreatePatientInput {
    name: string;
    cpf: string;
    address: string;
    phoneNumber: string;
    additionalPhoneNumbers: string[];
    dateOfBirth: string;
    priority: "urgent" | "high" | "medium" | "low" | "";
    conditions: string[];
    visitPeriodicityDays: number;
    cns: string;
    microarea: string;
    communityHealthWorkerId: string;
    doctorId: string;
    nurseId: string;
}