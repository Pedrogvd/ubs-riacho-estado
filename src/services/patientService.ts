import { esClient, INDICES } from "./esClient";
import { AlertLevel, CreatePatientInput, Patient, PatientWithAlert } from "../types";

export const VALID_CONDITIONS = [
    "diabetes",
    "hypertension",
    "pregnant",
    "postpartum",
    "child_under_2",
    "bedridden_elderly",
    "frail_elderly",
    "physical_disability",
    "mental_disorder",
    "tuberculosis",
    "leprosy",
    "substance_dependency",
] as const;

// normaliza nome pra comparar (minusculo, sem acento, sem espacos duplicados)
// -- usado no aviso de possivel duplicado por nome + data de nascimento
export function normalizeName(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

// o paciente aparece pra um profissional comum se ele estiver em qualquer
// uma das 3 funcoes do time (ACS, medico ou enfermeiro), nao so como ACS
export function isOnPatientTeam(
    patient: Pick<Patient, "communityHealthWorkerId" | "doctorId" | "nurseId">,
    professionalId: string
): boolean {
    return (
        patient.communityHealthWorkerId === professionalId ||
        patient.doctorId === professionalId ||
        patient.nurseId === professionalId
    );
}

export async function createPatient(input: CreatePatientInput): Promise<Patient> {
    const patient: Patient = {
        id: crypto.randomUUID(),
        name: input.name,
        cpf: input.cpf,
        address: input.address,
        phoneNumber: input.phoneNumber,
        additionalPhoneNumbers: input.additionalPhoneNumbers,
        dateOfBirth: input.dateOfBirth,
        priority: input.priority,
        conditions: input.conditions,
        visitPeriodicityDays: input.visitPeriodicityDays,
        active: true,
        createdAt: new Date().toISOString(),
        lastVisitAt: null,
        nextVisitDue: null,
        cns: input.cns,
        microarea: input.microarea,
        communityHealthWorkerId: input.communityHealthWorkerId,
        doctorId: input.doctorId,
        nurseId: input.nurseId,
    }

    await esClient.index({
        index: INDICES.patients,
        id: patient.id,
        body: patient,
        refresh: "wait_for"
    })

    return patient;
}

// esse recurso ainda não está pronto pra ser mostrado pro usuário (critérios
// ainda sendo validados), então por enquanto ele fica desligado e a função
// sempre retorna "" (sem alerta). A lógica de cálculo continua abaixo, intacta,
// pra quando for habilitado de novo — é só trocar esse valor pra true.
const ALERT_LEVEL_ENABLED = false;

export function calculateAlertLevel(patient: Patient, now: Date = new Date()): AlertLevel {
    if (!ALERT_LEVEL_ENABLED) {
        return "";
    }

    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    const daysAgo30 = new Date(now);
    daysAgo30.setDate(daysAgo30.getDate() - 30);

    if (!patient.lastVisitAt || new Date(patient.lastVisitAt) < daysAgo30) {
        return "critical";
    }
    if (patient.nextVisitDue && new Date(patient.nextVisitDue) < now) {
        return "overdue";
    }

    if (patient.nextVisitDue && new Date(patient.nextVisitDue) <= in7Days) {
        return "upcoming";
    }

    return "ok";
}

// scopeToProfessionalId: quando informado, só retorna pacientes cujo ACS
// responsável é esse profissional (usado pra quem não é admin)
export async function listPatients(scopeToProfessionalId?: string): Promise<PatientWithAlert[]> {
    const result = await esClient.search({
        index: INDICES.patients,
        body: {
            query: { match_all: {} },
            size: 200
        }
    });

    const now = new Date();

    const patients = result.body.hits.hits.map((hit: any) => {
        const patient = hit._source as Patient;
        return { ...patient, alertLevel: calculateAlertLevel(patient, now) };
    });

    if (!scopeToProfessionalId) {
        return patients;
    }

    // profissional comum ve o paciente se estiver em QUALQUER uma das 3
    // funcoes do time (ACS, medico ou enfermeiro) — nao so como ACS, que
    // era a regra antiga e causava gente recadastrando o mesmo paciente
    // em perfis diferentes achando que "ainda nao existia"
    return patients.filter(
        (patient) =>
            patient.communityHealthWorkerId === scopeToProfessionalId ||
            patient.doctorId === scopeToProfessionalId ||
            patient.nurseId === scopeToProfessionalId
    );
}

export async function getPatient(id: string): Promise<PatientWithAlert | null> {
    try {
        const result = await esClient.get({
            index: INDICES.patients,
            id: id
        })

        const source = result.body._source as Patient | undefined;
        if (!source) return null;

        return { ...source, alertLevel: calculateAlertLevel(source) };

    } catch (error: any) {
        if (error.meta?.statusCode === 404) return null;
        throw error;
    }
}

// updates parciais (edição de paciente) — só os campos enviados são mesclados no documento existente
export async function updatePatient(
    id: string,
    updates: Partial<Omit<Patient, "id" | "createdAt" | "lastVisitAt" | "nextVisitDue">>
): Promise<PatientWithAlert | null> {
    try {
        await esClient.update({
            index: INDICES.patients,
            id,
            body: { doc: updates },
            refresh: "wait_for",
        });
    } catch (error: any) {
        if (error.meta?.statusCode === 404) return null;
        throw error;
    }

    return getPatient(id);
}

// nextVisitDue agora é digitado manualmente por quem registra a visita (não
// é mais calculado a partir da periodicidade) -- a equipe decidiu que a
// data calculada automaticamente não refletia bem a realidade do
// acompanhamento, e preferiu decidir a próxima data caso a caso.
//
// só atualiza lastVisitAt/nextVisitDue se essa visita for a mais RECENTE
// (por data da visita, não por ordem de registro) -- sem isso, registrar
// uma visita atrasada (de uma data mais antiga) depois de uma visita mais
// nova já registrada faria "última visita" voltar pro passado por engano
export async function updatePatientAfterVisit(patientId: string, visitDate: string, nextVisitDue: string | null): Promise<void> {
    const patient = await getPatient(patientId)
    if (!patient) throw new Error(`Patient ${patientId} not found`);

    const isMostRecentVisit = !patient.lastVisitAt || new Date(visitDate) >= new Date(patient.lastVisitAt);
    if (!isMostRecentVisit) return;

    // nextVisitDue agora é opcional na hora de registrar a visita -- se quem
    // registrou não informou uma próxima data, não apaga a que o paciente já
    // tinha (só atualiza lastVisitAt); só sobrescreve nextVisitDue quando uma
    // nova data foi realmente informada nessa visita
    const doc: Record<string, unknown> = { lastVisitAt: visitDate };
    if (nextVisitDue) {
        doc.nextVisitDue = nextVisitDue;
    }

    await esClient.update({
        index: INDICES.patients,
        id: patientId,
        body: { doc },
        refresh: "wait_for"
    })
}

// apaga o documento do paciente. NÃO apaga visitas/IVCF ligados a ele —
// isso é responsabilidade de quem chama (ver a rota DELETE /patients/:id,
// que apaga o histórico clínico primeiro pra não deixar registro órfão)
export async function deletePatient(id: string): Promise<void> {
    try {
        await esClient.delete({
            index: INDICES.patients,
            id,
            refresh: "wait_for",
        });
    } catch (error: any) {
        if (error.meta?.statusCode === 404) return;
        throw error;
    }
}

export function addDays(isoDate: string, days: number): string {
    const date = new Date(isoDate);
    date.setDate(date.getDate() + days);
    return date.toISOString();
}