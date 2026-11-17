export interface Visit {
    id: string;
    patientId: string;
    professionalId: string;
    visitDate: string;
    // string ou null -- nunca string vazia (elasticsearch mapeia esse campo
    // como "date" por causa das visitas antigas; mandar "" pra um campo date
    // quebra com mapper_parsing_exception, só null é aceito como "sem valor")
    nextVisitDue: string | null;
    outcome: "completed" | "patient_absent" | "refused";
    bloodPressure: string;
    weightKg: number | null;
    bloodGlucoseMgDl: number | null;
    needsReferral: boolean;
    referredTo: string;
    notes: string;
}