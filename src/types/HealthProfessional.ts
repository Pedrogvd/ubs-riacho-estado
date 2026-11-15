export interface HealthProfessional {
    id: string;
    name: string;
    cpf: string;
    address: string;
    phoneNumber: string;
    email: string;
    passwordHash: string;
    role: "admin" | "professional";
    // funcao clinica, separada do "role" (que e so permissao de sistema).
    // "" = ainda nao classificado (cadastros antigos).
    specialty: "" | "chw" | "doctor" | "nurse";
    active: boolean;
    createdAt: string;
}