import { Component, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Patients as PatientsService, Patient } from '../../services/patients';
import { HealthProfessionals as HealthProfessionalsService, HealthProfessional } from '../../services/health-professionals';
import { Auth as AuthService } from '../../services/auth';
import { Pagination } from '../../components/pagination/pagination';

const PRIORITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const PAGE_SIZE = 5;

// três jeitos de um paciente ativo estar em relação às visitas:
// - "never": nunca foi visitado (sem nextVisitDue)
// - "overdue": já passou da data calculada (última visita + periodicidade) —
//   ou seja, não foi visitado dentro do prazo esperado
// - "ok": tem próxima visita calculada e ela ainda está no futuro
export type VisitStatus = 'never' | 'overdue' | 'ok';

export interface PatientVisitStatus extends Patient {
  visitStatus: VisitStatus;
  // data usada pra ordenar e, quando fizer sentido, exibir: pra "never" é
  // quando o paciente foi cadastrado; pra "overdue"/"ok" é a própria
  // próxima visita calculada (nextVisitDue)
  statusDate: string;
}

@Component({
  selector: 'app-visits-needed',
  imports: [RouterLink, DatePipe, Pagination],
  templateUrl: './visits-needed.html',
  styleUrl: './visits-needed.scss',
})
export class VisitsNeeded implements OnInit {
  allPatients = signal<Patient[]>([]);
  healthProfessionals = signal<HealthProfessional[]>([]);
  currentPage = signal(1);

  searchTerm = signal('');
  // filtra por qualquer um dos 3 papeis do time (ACS, medico ou enfermeiro),
  // nao so por ACS -- por isso o dropdown lista todos os profissionais
  professionalFilter = signal<'all' | string>('all');
  // por padrão só mostra quem precisa de atenção (nunca visitado + atrasado)
  // -- "em dia" e "todos" ficam só um clique de distância, mas não poluem
  // a visão principal do dia a dia
  statusFilter = signal<'needs-attention' | 'ok' | 'all'>('needs-attention');

  patientsWithStatus = computed<PatientVisitStatus[]>(() => {
    const now = new Date();

    return this.allPatients()
      .filter((patient) => patient.active)
      .map((patient) => {
        let visitStatus: VisitStatus;
        if (!patient.nextVisitDue) {
          visitStatus = 'never';
        } else if (new Date(patient.nextVisitDue) < now) {
          visitStatus = 'overdue';
        } else {
          visitStatus = 'ok';
        }

        return {
          ...patient,
          visitStatus,
          statusDate: patient.nextVisitDue ?? patient.createdAt,
        };
      })
      .sort((a, b) => {
        const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // dentro da mesma prioridade, os casos mais antigos (esperando há
        // mais tempo, ou atrasados há mais tempo) vêm primeiro
        return new Date(a.statusDate).getTime() - new Date(b.statusDate).getTime();
      });
  });

  filteredPatients = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const professionalId = this.professionalFilter();
    const status = this.statusFilter();

    return this.patientsWithStatus().filter((patient) => {
      if (status === 'needs-attention' && patient.visitStatus === 'ok') return false;
      if (status === 'ok' && patient.visitStatus !== 'ok') return false;

      if (search && !patient.name.toLowerCase().includes(search)) return false;
      if (
        professionalId !== 'all' &&
        patient.communityHealthWorkerId !== professionalId &&
        patient.doctorId !== professionalId &&
        patient.nurseId !== professionalId
      ) {
        return false;
      }
      return true;
    });
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredPatients().length / PAGE_SIZE)));

  pagedPatients = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filteredPatients().slice(start, start + PAGE_SIZE);
  });

  constructor(
    private patientsService: PatientsService,
    private healthProfessionalsService: HealthProfessionalsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.patientsService.list().subscribe((data) => {
      this.allPatients.set(data);
    });

    this.healthProfessionalsService.list().subscribe((data) => {
      this.healthProfessionals.set(data);
    });
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  onSearchChange(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  onProfessionalFilterChange(event: Event): void {
    this.professionalFilter.set((event.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as 'needs-attention' | 'ok' | 'all');
    this.currentPage.set(1);
  }

  professionalName(professionalId: string): string {
    if (!professionalId) return '-';
    const professional = this.healthProfessionals().find((p) => p.id === professionalId);
    return professional?.name ?? '-';
  }

  priorityLabel(priority: Patient['priority']): string {
    switch (priority) {
      case 'urgent': return 'Muito Alta';
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      case 'low': return 'Baixa';
      default: return '-';
    }
  }
}
