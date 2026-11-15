import { esClient, INDICES } from "./esClient";

export type TeamField = "chw" | "doctor" | "nurse";

export interface PatientTeamLogEntry {
    id: string;
    patientId: string;
    field: TeamField;
    previousProfessionalId: string;
    newProfessionalId: string;
    changedBy: string;
    changedAt: string;
}

// Registra, pra cada uma das 3 funções (ACS/médico/enfermeiro), se o valor
// mudou entre o estado "antes" e "depois" do paciente. Usado tanto na
// criação (previous = "") quanto na edição. Não grava nada pra campo que
// não mudou.
export async function recordTeamChanges(params: {
    patientId: string;
    changedBy: string;
    before: { communityHealthWorkerId: string; doctorId: string; nurseId: string };
    after: { communityHealthWorkerId: string; doctorId: string; nurseId: string };
}): Promise<void> {
    const { patientId, changedBy, before, after } = params;

    const pairs: { field: TeamField; prev: string; next: string }[] = [
        { field: "chw", prev: before.communityHealthWorkerId, next: after.communityHealthWorkerId },
        { field: "doctor", prev: before.doctorId, next: after.doctorId },
        { field: "nurse", prev: before.nurseId, next: after.nurseId },
    ];

    const changed = pairs.filter((p) => p.prev !== p.next);
    if (changed.length === 0) return;

    await Promise.all(
        changed.map((p) => {
            const entry: PatientTeamLogEntry = {
                id: crypto.randomUUID(),
                patientId,
                field: p.field,
                previousProfessionalId: p.prev,
                newProfessionalId: p.next,
                changedBy,
                changedAt: new Date().toISOString(),
            };

            return esClient.index({
                index: INDICES.patientTeamLog,
                id: entry.id,
                body: entry,
                refresh: "wait_for",
            });
        })
    );
}

export async function listTeamChangesForPatient(patientId: string): Promise<PatientTeamLogEntry[]> {
    const result = await esClient.search({
        index: INDICES.patientTeamLog,
        body: {
            query: { term: { patientId } },
            sort: [{ changedAt: { order: "desc" } }],
            size: 200,
        },
    });

    return result.body.hits.hits.map((hit: any) => hit._source as PatientTeamLogEntry);
}
