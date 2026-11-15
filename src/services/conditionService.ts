import { esClient, INDICES } from "./esClient";
import { Condition } from "../types";
import { listPatients } from "./patientService";

export class ConditionInUseError extends Error {
    constructor(public count: number) {
        super(`esta condicao esta em uso por ${count} paciente(s)`);
    }
}

// normaliza (minusculo, sem acento, sem espaco duplicado) só pra COMPARAR
// e achar duplicata -- o label de verdade (com acento e maiuscula) e o que
// a pessoa digitou, guardado como veio
export function normalizeConditionLabel(label: string): string {
    return label
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

export async function listCustomConditions(): Promise<Condition[]> {
    const result = await esClient.search({
        index: INDICES.customConditions,
        body: {
            query: { match_all: {} },
            size: 500,
            sort: [{ label: { order: "asc" } }],
        },
    });

    return result.body.hits.hits.map((hit: any) => hit._source as Condition);
}

export async function getCustomConditionById(id: string): Promise<Condition | null> {
    try {
        const result = await esClient.get({ index: INDICES.customConditions, id });
        return result.body._source as Condition;
    } catch (error: any) {
        if (error.meta?.statusCode === 404) return null;
        throw error;
    }
}

// cria uma condicao personalizada nova OU devolve a que ja existe com o
// mesmo nome (normalizado) -- assim "Outro" nao vira uma lista cheia de
// duplicata por causa de maiuscula/acento/espaco a mais
export async function findOrCreateCustomCondition(label: string, createdBy: string): Promise<Condition> {
    const trimmed = label.trim();
    const normalized = normalizeConditionLabel(trimmed);

    const existing = await listCustomConditions();
    const match = existing.find((condition) => normalizeConditionLabel(condition.label) === normalized);
    if (match) return match;

    const condition: Condition = {
        id: crypto.randomUUID(),
        label: trimmed,
        createdBy,
        createdAt: new Date().toISOString(),
    };

    await esClient.index({
        index: INDICES.customConditions,
        id: condition.id,
        body: condition,
        refresh: "wait_for",
    });

    return condition;
}

// apaga uma condicao personalizada -- bloqueia se algum paciente (ativo ou
// nao) ainda tiver essa condicao marcada, pra nao sobrar um id "fantasma"
// no cadastro do paciente (apareceria sem label no dashboard/relatorios)
export async function deleteCustomCondition(id: string): Promise<void> {
    const patients = await listPatients();
    const usageCount = patients.filter((patient) => patient.conditions?.includes(id)).length;
    if (usageCount > 0) {
        throw new ConditionInUseError(usageCount);
    }

    try {
        await esClient.delete({
            index: INDICES.customConditions,
            id,
            refresh: "wait_for",
        });
    } catch (error: any) {
        if (error.meta?.statusCode === 404) return;
        throw error;
    }
}

