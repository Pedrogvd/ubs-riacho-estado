export interface VisitOutcomeBreakdown {
    completed: number;
    patient_absent: number;
    refused: number;
    total: number;
    successRate: number;
}

export interface CommunityHealthWorkerRanking {
    professionalId: string;
    professionalName: string;
    visitsCount: number;
}

export interface ConditionBreakdown {
    condition: string;
    patientsVisited: number;
}

export interface MonthlyReport {
    month: string;
    visitOutcomes: VisitOutcomeBreakdown;
    communityHealthWorkerRanking: CommunityHealthWorkerRanking[];
    conditionBreakdown: ConditionBreakdown[];
    newPatientsCount: number;
}