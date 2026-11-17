export interface CreatePatientInput {
    name: string;
    cpf: string;
    address: string;
    phoneNumber: string;
    additionalPhoneNumbers: string[];
    dateOfBirth: string;
    priority: "high" | "medium" | "low" | "";
    conditions: string[];
    visitPeriodicityDays: number;
    cns: string;
    microarea: string;
    communityHealthWorkerId: string;
    doctorId: string;
    nurseId: string;
}