import { Router } from "express";
import { createPatient, listPatients, getPatient, updatePatient, deletePatient, VALID_CONDITIONS, addDays, isOnPatientTeam, normalizeName } from "../services/patientService";
import { deleteVisitsByPatient } from "../services/visitService";
import { deleteIvcfAssessmentsByPatient } from "../services/ivcfAssessmentService";
import { recordTeamChanges } from "../services/patientTeamLogService";
import { getHealthProfessionalById } from "../services/healthProfessionalService";
import { listCustomConditions } from "../services/conditionService";

export const patientsRouter = Router();

// confere se cada valor em "conditions" e um dos fixos (VALID_CONDITIONS) OU
// o id de uma condicao personalizada que ja existe (criada via "Outro" no
// formulario) -- usado tanto na criacao quanto na edicao do paciente
async function findInvalidConditions(conditions: string[]): Promise<string[]> {
    const customConditions = await listCustomConditions();
    const customConditionIds = new Set(customConditions.map((condition) => condition.id));
    return conditions.filter(
        (condition) => !(VALID_CONDITIONS as readonly string[]).includes(condition) && !customConditionIds.has(condition)
    );
}

patientsRouter.post("/", async (req, res) => {
    try {
        const { name, cpf, address, phoneNumber, dateOfBirth, priority, conditions, visitPeriodicityDays, cns, microarea, communityHealthWorkerId, doctorId, nurseId, forceCreate } = req.body;

        if (!name) {
            return res.status(400).json({ error: "name is required" });
        }

        if (!cpf && !cns) {
            return res.status(400).json({ error: "at least one of cpf or cns is required" });
        }

        if (cpf && !/^\d{11}$/.test(cpf)) {
            return res.status(400).json({ error: "cpf must contain exactly 11 digits" });
        }

        if (phoneNumber && !/^\d{10,11}$/.test(phoneNumber)) {
            return res.status(400).json({ error: "phoneNumber must contain 10 or 11 digits" });
        }

        if (cns && !/^\d{15}$/.test(cns)) {
            return res.status(400).json({ error: "cns must contain exactly 15 digits" });
        }

        if (conditions) {
            const invalidConditions = await findInvalidConditions(conditions);
            if (invalidConditions.length > 0) {
                return res.status(400).json({ error: `conditions contains unknown values: ${invalidConditions.join(", ")}` });
            }
        }

        // Evita cadastrar o mesmo paciente mais de uma vez (ex.: clique duplo
        // no botao de salvar, ou reenvio apos a conexao travar): se ja existe
        // um paciente ativo com o mesmo CPF ou CNS, bloqueia a criacao.
        if (cpf || cns) {
            const existingPatients = await listPatients();
            const duplicate = existingPatients.find(
                (p) => p.active && ((cpf && p.cpf === cpf) || (cns && p.cns === cns))
            );
            if (duplicate) {
                return res.status(409).json({
                    error: `Já existe um paciente ativo cadastrado com esse ${duplicate.cpf === cpf && cpf ? "CPF" : "CNS"}: ${duplicate.name}`,
                });
            }
        }

        // Aviso (nao bloqueia): a trava acima so pega duplicata quando os dois
        // cadastros compartilham o mesmo CPF ou o mesmo CNS preenchido. Isso nao
        // cobre o caso de alguem ja cadastrado so com CPF ser recadastrado so com
        // CNS (ou vice-versa) — nesse caso nao sobra nenhum campo em comum pra
        // comparar. Como segunda linha de defesa, avisa (sem bloquear, porque
        // nome + data de nascimento iguais nao garantem 100% que e a mesma
        // pessoa) quando ja existe um paciente ativo com o mesmo nome e a mesma
        // data de nascimento. Quem esta cadastrando pode confirmar que sao
        // pessoas diferentes e seguir mesmo assim reenviando com forceCreate.
        if (!forceCreate && name && dateOfBirth) {
            const existingPatients = await listPatients();
            const normalizedName = normalizeName(name);
            const possibleDuplicate = existingPatients.find(
                (p) => p.active && p.dateOfBirth === dateOfBirth && normalizeName(p.name) === normalizedName
            );
            if (possibleDuplicate) {
                return res.status(409).json({
                    error: `Já existe um paciente ativo com o mesmo nome e data de nascimento: ${possibleDuplicate.name}. Tem certeza que não é a mesma pessoa?`,
                    type: "possible_duplicate",
                });
            }
        }

        // qualquer profissional (admin ou nao) pode indicar o ACS, o medico e o
        // enfermeiro responsaveis — os 3 sao opcionais e independentes entre si
        let resolvedCommunityHealthWorkerId = communityHealthWorkerId || "";
        let resolvedDoctorId = doctorId || "";
        let resolvedNurseId = nurseId || "";

        // rede de seguranca: se quem esta criando nao e admin e nao ficou em
        // NENHUMA das 3 funcoes (ex.: esqueceu de se marcar, ou a funcao
        // clinica dele ainda nao foi configurada), ele entra automaticamente
        // na funcao que bate com a dele — ou como ACS, se ainda nao tiver
        // funcao definida — pra nao cadastrar um paciente e nao conseguir
        // mais achar ele depois
        const isAdmin = req.user!.role === "admin";
        const creatorIsOnTeam = [resolvedCommunityHealthWorkerId, resolvedDoctorId, resolvedNurseId]
            .includes(req.user!.professionalId);

        if (!isAdmin && !creatorIsOnTeam) {
            const self = await getHealthProfessionalById(req.user!.professionalId);
            if (self?.specialty === "doctor") {
                resolvedDoctorId = self.id;
            } else if (self?.specialty === "nurse") {
                resolvedNurseId = self.id;
            } else {
                resolvedCommunityHealthWorkerId = req.user!.professionalId;
            }
        }

        const patient = await createPatient({
            name,
            cpf: cpf || "",
            address: address || "",
            phoneNumber: phoneNumber || "",
            dateOfBirth: dateOfBirth || "",
            priority: priority || "",
            conditions: conditions || [],
            visitPeriodicityDays: visitPeriodicityDays || 30,
            cns: cns || "",
            microarea: microarea || "",
            communityHealthWorkerId: resolvedCommunityHealthWorkerId,
            doctorId: resolvedDoctorId,
            nurseId: resolvedNurseId,
        })

        // registra no historico quem ficou responsavel por cada funcao desde a criacao
        await recordTeamChanges({
            patientId: patient.id,
            changedBy: req.user!.professionalId,
            before: { communityHealthWorkerId: "", doctorId: "", nurseId: "" },
            after: {
                communityHealthWorkerId: patient.communityHealthWorkerId,
                doctorId: patient.doctorId,
                nurseId: patient.nurseId,
            },
        });

        res.status(201).json(patient);

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
})

patientsRouter.get("/", async (req, res) => {
    try {
        const isAdmin = req.user!.role === "admin";
        const patients = await listPatients(isAdmin ? undefined : req.user!.professionalId);
        res.json(patients);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
})

patientsRouter.get("/:id", async (req, res)=> {
    try {
        const patient = await getPatient(req.params.id);
        if (!patient) return res.status(404).json({ error: "Patient not found" });

        const isAdmin = req.user!.role === "admin";
        if (!isAdmin && !isOnPatientTeam(patient, req.user!.professionalId)) {
            return res.status(403).json({ error: "you don't have access to this patient" });
        }

        res.json(patient);

    } catch (error: any) {
         res.status(500).json({ error: error.message });
    }
})

// edição de paciente: admin edita qualquer um, ACS só edita os seus próprios
patientsRouter.patch("/:id", async (req, res) => {
    try {
        const existing = await getPatient(req.params.id);
        if (!existing) return res.status(404).json({ error: "Patient not found" });

        const isAdmin = req.user!.role === "admin";
        if (!isAdmin && !isOnPatientTeam(existing, req.user!.professionalId)) {
            return res.status(403).json({ error: "you don't have access to this patient" });
        }

        const { name, cpf, address, phoneNumber, dateOfBirth, priority, conditions, visitPeriodicityDays, cns, microarea, communityHealthWorkerId, doctorId, nurseId, active } = req.body;

        if (cpf !== undefined && cpf !== "" && !/^\d{11}$/.test(cpf)) {
            return res.status(400).json({ error: "cpf must contain exactly 11 digits" });
        }

        if (phoneNumber !== undefined && phoneNumber !== "" && !/^\d{10,11}$/.test(phoneNumber)) {
            return res.status(400).json({ error: "phoneNumber must contain 10 or 11 digits" });
        }

        if (cns !== undefined && cns !== "" && !/^\d{15}$/.test(cns)) {
            return res.status(400).json({ error: "cns must contain exactly 15 digits" });
        }

        // depois de aplicar o patch, tem que sobrar pelo menos um dos dois
        // identificadores (cpf ou cns) — mesma regra do cadastro
        const resultingCpf = cpf !== undefined ? cpf : existing.cpf;
        const resultingCns = cns !== undefined ? cns : existing.cns;
        if (!resultingCpf && !resultingCns) {
            return res.status(400).json({ error: "at least one of cpf or cns is required" });
        }

        if (conditions !== undefined) {
            const invalidConditions = await findInvalidConditions(conditions);
            if (invalidConditions.length > 0) {
                return res.status(400).json({ error: `conditions contains unknown values: ${invalidConditions.join(", ")}` });
            }
        }

        if (active !== undefined && typeof active !== "boolean") {
            return res.status(400).json({ error: "active must be a boolean" });
        }

        // periodicidade vazia/zerada vira 30 dias (mesmo padrão do cadastro). Se a
        // periodicidade mudou e o paciente já teve alguma visita, recalcula a
        // "próxima visita" a partir da última visita registrada — sem isso, editar
        // só a periodicidade não corrige uma "próxima visita" já salva errada
        const resolvedVisitPeriodicityDays = visitPeriodicityDays === undefined
            ? undefined
            : (visitPeriodicityDays || 30);

        const updates: Record<string, unknown> = {
            name, cpf, address, phoneNumber, dateOfBirth,
            priority,
            conditions, visitPeriodicityDays: resolvedVisitPeriodicityDays, cns, microarea, active,
        };

        if (resolvedVisitPeriodicityDays !== undefined && existing.lastVisitAt) {
            updates.nextVisitDue = addDays(existing.lastVisitAt, resolvedVisitPeriodicityDays);
        }

        // qualquer profissional do time (ou admin) pode reatribuir o ACS, o
        // medico ou o enfermeiro responsaveis — fica tudo registrado no log
        if (communityHealthWorkerId !== undefined) updates.communityHealthWorkerId = communityHealthWorkerId;
        if (doctorId !== undefined) updates.doctorId = doctorId;
        if (nurseId !== undefined) updates.nurseId = nurseId;

        // tira do objeto os campos que não foram enviados, pra só mesclar o que realmente mudou
        Object.keys(updates).forEach((key) => {
            if (updates[key] === undefined) delete updates[key];
        });

        const updated = await updatePatient(req.params.id, updates);
        if (!updated) return res.status(404).json({ error: "Patient not found" });

        await recordTeamChanges({
            patientId: req.params.id,
            changedBy: req.user!.professionalId,
            before: {
                communityHealthWorkerId: existing.communityHealthWorkerId,
                doctorId: existing.doctorId,
                nurseId: existing.nurseId,
            },
            after: {
                communityHealthWorkerId: updated.communityHealthWorkerId,
                doctorId: updated.doctorId,
                nurseId: updated.nurseId,
            },
        });

        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
})

// exclusão de paciente: admin pode excluir qualquer um; ACS comum só pode
// excluir os pacientes sob sua própria responsabilidade (mesma regra de
// acesso usada na edição). Apaga também o histórico clínico ligado a ele
// (visitas e avaliações IVCF-20) pra não deixar registro órfão no índice —
// ação irreversível, usada principalmente pra remover cadastros de teste.
patientsRouter.delete("/:id", async (req, res) => {
    try {
        const existing = await getPatient(req.params.id);
        if (!existing) return res.status(404).json({ error: "Patient not found" });

        const isAdmin = req.user!.role === "admin";
        if (!isAdmin && !isOnPatientTeam(existing, req.user!.professionalId)) {
            return res.status(403).json({ error: "you don't have access to this patient" });
        }

        await deleteVisitsByPatient(req.params.id);
        await deleteIvcfAssessmentsByPatient(req.params.id);
        await deletePatient(req.params.id);

        res.status(204).send();
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
})
