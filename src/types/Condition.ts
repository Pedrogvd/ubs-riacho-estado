// condicao personalizada (a opcao "Outro" do formulario de paciente),
// cadastrada por qualquer profissional e reutilizavel entre pacientes -- em
// vez de cada um digitar um texto livre diferente pra mesma condicao
export interface Condition {
    id: string;
    label: string;
    createdBy: string;
    createdAt: string;
}
