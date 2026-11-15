import { Router } from "express";
import { listCustomConditions, findOrCreateCustomCondition, deleteCustomCondition, getCustomConditionById, ConditionInUseError } from "../services/conditionService";

export const conditionsRouter = Router();

// qualquer profissional logado ve a lista inteira -- usada tanto pra buscar
// (evitar duplicata ao digitar em "Outro" no formulario de paciente) quanto
// pra tabela somente-leitura em Configuracoes (essa, sim, só pra admin --
// controlado no proprio frontend, igual as outras abas de Configuracoes)
conditionsRouter.get("/", async (req, res) => {
    try {
        const conditions = await listCustomConditions();
        res.json(conditions);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// cria uma condicao personalizada nova (ou devolve a que ja existe com o
// mesmo nome) -- qualquer profissional pode, nao so admin, porque e
// basicamente parte do cadastro do paciente
conditionsRouter.post("/", async (req, res) => {
    try {
        const { label } = req.body;

        if (!label || typeof label !== "string" || !label.trim()) {
            return res.status(400).json({ error: "label is required" });
        }

        const condition = await findOrCreateCustomCondition(label, req.user!.professionalId);
        res.status(201).json(condition);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// apaga uma condicao personalizada -- admin pode excluir qualquer uma (aba
// Configuracoes > Condicoes), e quem criou pode excluir a propria (ex.:
// corrigir um erro de digitacao no "Outro" do formulario de paciente, sem
// precisar ser admin pra desfazer o que acabou de criar)
conditionsRouter.delete("/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (typeof id !== "string") {
            return res.status(400).json({ error: "invalid id" });
        }

        const condition = await getCustomConditionById(id);
        if (condition) {
            const isAdmin = req.user!.role === "admin";
            const isCreator = condition.createdBy === req.user!.professionalId;
            if (!isAdmin && !isCreator) {
                return res.status(403).json({ error: "you can only delete a condition you created" });
            }
        }

        await deleteCustomCondition(id);
        res.status(204).send();
    } catch (error: any) {
        if (error instanceof ConditionInUseError) {
            return res.status(409).json({
                error: `Essa condição está marcada em ${error.count} paciente(s) e não pode ser excluída.`,
            });
        }
        res.status(500).json({ error: error.message });
    }
});
