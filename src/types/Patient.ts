export interface Patient {
    id: string;
    name: string;
    cpf: string;
    address: string;
    phoneNumber: string;
    // telefones extras, alem do principal (phoneNumber) -- todos opcionais
    additionalPhoneNumbers: string[];
    dateOfBirth: string;
    priority: "high" | "medium" | "low" | "";
    conditions: string[];
    visitPeriodicityDays: number;
    active: boolean;
    createdAt: string;
    lastVisitAt: string | null;
    nextVisitDue: string | null;
    cns: string;
    microarea: string;
    // time de responsaveis do paciente: cada um e opcional e no maximo um por
    // funcao (ex.: um so medico). Visibilidade pra profissional comum agora
    // depende de estar em QUALQUER um desses tres, nao so do ACS.
    communityHealthWorkerId: string;
    doctorId: string;
    nurseId: string;
}

export type AlertLevel = "critical" | "overdue" | "upcoming" | "ok" | "";

export interface PatientWithAlert extends Patient {
    alertLevel: AlertLevel;
}