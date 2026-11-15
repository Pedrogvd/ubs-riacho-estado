import { Component, OnInit, HostListener, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { HealthProfessionals as HealthProfessionalsService, HealthProfessional } from '../../services/health-professionals';
import { Patients as PatientsService, Patient } from '../../services/patients';
import { Conditions as ConditionsService, Condition } from '../../services/conditions';
import { Auth as AuthService } from '../../services/auth';
import { Pagination } from '../../components/pagination/pagination';

const PAGE_SIZE = 5;

type Tab = 'patients' | 'professionals' | 'conditions';

@Component({
  selector: 'app-settings',
  imports: [RouterLink, Pagination, DatePipe],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  activeTab = signal<Tab>('patients');

  patients = signal<Patient[]>([]);
  patientsPage = signal(1);
  patientSearch = signal('');
  patientDeleteError = signal('');
  patientToDelete = signal<Patient | null>(null);
  deletingPatient = signal(false);

  // menu de ações por linha (Pacientes): em vez de mostrar os 6 botões
  // sempre (o que empurrava a tabela pro lado), só mostra ao clicar. Guarda
  // o id do paciente com o menu aberto e a posição (calculada a partir do
  // botão clicado) -- usa position:fixed pra nao ficar cortado pelo scroll
  // horizontal da tabela.
  openActionsFor = signal<string | null>(null);
  actionsMenuPosition = signal<{ top: number; left: number }>({ top: 0, left: 0 });

  filteredPatients = computed(() => {
    const search = this.patientSearch().trim().toLowerCase();
    if (!search) return this.patients();
    return this.patients().filter((patient) => patient.name.toLowerCase().includes(search));
  });

  patientsTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredPatients().length / PAGE_SIZE)));

  pagedPatients = computed(() => {
    const start = (this.patientsPage() - 1) * PAGE_SIZE;
    return this.filteredPatients().slice(start, start + PAGE_SIZE);
  });

  professionals = signal<HealthProfessional[]>([]);
  professionalsPage = signal(1);
  professionalSearch = signal('');

  // aba Condições: só leitura, lista as condições personalizadas ("Outro")
  // cadastradas pelos profissionais no formulário de paciente
  conditions = signal<Condition[]>([]);
  conditionsPage = signal(1);
  conditionSearch = signal('');
  conditionDeleteError = signal('');
  conditionToDelete = signal<Condition | null>(null);
  deletingCondition = signal(false);

  filteredConditions = computed(() => {
    const search = this.conditionSearch().trim().toLowerCase();
    if (!search) return this.conditions();
    return this.conditions().filter((condition) => condition.label.toLowerCase().includes(search));
  });

  conditionsTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredConditions().length / PAGE_SIZE)));

  pagedConditions = computed(() => {
    const start = (this.conditionsPage() - 1) * PAGE_SIZE;
    return this.filteredConditions().slice(start, start + PAGE_SIZE);
  });

  filteredProfessionals = computed(() => {
    const search = this.professionalSearch().trim().toLowerCase();
    if (!search) return this.professionals();
    return this.professionals().filter((professional) => professional.name.toLowerCase().includes(search));
  });

  professionalsTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredProfessionals().length / PAGE_SIZE)));

  pagedProfessionals = computed(() => {
    const start = (this.professionalsPage() - 1) * PAGE_SIZE;
    return this.filteredProfessionals().slice(start, start + PAGE_SIZE);
  });

  constructor(
    private healthProfessionalsService: HealthProfessionalsService,
    private patientsService: PatientsService,
    private conditionsService: ConditionsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadPatients();
    this.loadProfessionals();
    this.loadConditions();
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  toggleActionsMenu(patientId: string, event: MouseEvent): void {
    // impede que esse clique chegue no listener de document:click logo
    // abaixo e feche o menu no mesmo instante em que ele abriu
    event.stopPropagation();

    if (this.openActionsFor() === patientId) {
      this.openActionsFor.set(null);
      return;
    }

    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 230;
    this.actionsMenuPosition.set({
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - menuWidth - 8),
    });
    this.openActionsFor.set(patientId);
  }

  closeActionsMenu(): void {
    this.openActionsFor.set(null);
  }

  @HostListener('document:click')
  @HostListener('window:scroll')
  @HostListener('window:resize')
  onDocumentInteraction(): void {
    this.closeActionsMenu();
  }

  isSelf(professional: HealthProfessional): boolean {
    return professional.id === this.authService.getProfessionalId();
  }

  roleLabel(role: HealthProfessional['role']): string {
    return role === 'admin' ? 'Admin' : 'Profissional';
  }

  // nome do profissional pra mostrar nas colunas de ACS/Médico(a)/Enfermeiro(a)
  // da aba Pacientes — em branco quando o paciente não tem ninguém naquela função
  professionalName(id: string): string {
    if (!id) return '';
    return this.professionals().find((p) => p.id === id)?.name ?? '';
  }

  specialtyLabel(specialty: HealthProfessional['specialty']): string {
    switch (specialty) {
      case 'chw': return 'ACS';
      case 'doctor': return 'Médico(a)';
      case 'nurse': return 'Enfermeiro(a)';
      default: return '-';
    }
  }

  priorityLabel(priority: Patient['priority']): string {
    switch (priority) {
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      case 'low': return 'Baixa';
      default: return '-';
    }
  }

  onPatientSearchChange(event: Event): void {
    this.patientSearch.set((event.target as HTMLInputElement).value);
    this.patientsPage.set(1);
  }

  onProfessionalSearchChange(event: Event): void {
    this.professionalSearch.set((event.target as HTMLInputElement).value);
    this.professionalsPage.set(1);
  }

  onConditionSearchChange(event: Event): void {
    this.conditionSearch.set((event.target as HTMLInputElement).value);
    this.conditionsPage.set(1);
  }

  private loadConditions(): void {
    this.conditionsService.list().subscribe((data) => {
      this.conditions.set(data);
    });
  }

  // exclusão de condição personalizada criada por engano (ex.: digitou
  // errado em "Outro") -- o backend bloqueia (409) se algum paciente ainda
  // tiver essa condição marcada, pra não sobrar um id sem label depois
  askDeleteCondition(condition: Condition): void {
    this.conditionDeleteError.set('');
    this.conditionToDelete.set(condition);
  }

  cancelDeleteCondition(): void {
    if (this.deletingCondition()) return;
    this.conditionToDelete.set(null);
    this.conditionDeleteError.set('');
  }

  confirmDeleteCondition(): void {
    const condition = this.conditionToDelete();
    if (!condition) return;

    this.deletingCondition.set(true);
    this.conditionDeleteError.set('');

    this.conditionsService.delete(condition.id).subscribe({
      next: () => {
        this.deletingCondition.set(false);
        this.conditionToDelete.set(null);
        this.loadConditions();
      },
      error: (err) => {
        this.deletingCondition.set(false);
        this.conditionDeleteError.set(
          err?.error?.error || 'Não foi possível excluir a condição. Tente novamente.'
        );
      },
    });
  }

  private loadPatients(): void {
    this.patientsService.list().subscribe((data) => {
      this.patients.set(data);
    });
  }

  // exclusão de paciente de teste (ou qualquer cadastro indevido): some
  // junto o histórico de visitas e IVCF-20 dele, então pede confirmação num
  // modal do próprio site (em vez do confirm() nativo do navegador) antes —
  // não tem como desfazer.
  askDeletePatient(patient: Patient): void {
    this.patientDeleteError.set('');
    this.patientToDelete.set(patient);
  }

  cancelDeletePatient(): void {
    if (this.deletingPatient()) return; // evita fechar no meio de um pedido em andamento
    this.patientToDelete.set(null);
    this.patientDeleteError.set('');
  }

  confirmDeletePatient(): void {
    const patient = this.patientToDelete();
    if (!patient) return;

    this.deletingPatient.set(true);
    this.patientDeleteError.set('');

    this.patientsService.delete(patient.id).subscribe({
      next: () => {
        this.deletingPatient.set(false);
        this.patientToDelete.set(null);
        this.loadPatients();
      },
      error: () => {
        this.deletingPatient.set(false);
        this.patientDeleteError.set('Não foi possível excluir o paciente. Tente novamente.');
      },
    });
  }

  private loadProfessionals(): void {
    this.healthProfessionalsService.list().subscribe((data) => {
      this.professionals.set(data);
    });
  }
}