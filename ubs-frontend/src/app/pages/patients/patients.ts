import { Component, OnInit, HostListener, signal, computed } from '@angular/core';
import { Patients as PatientsService, Patient } from '../../services/patients';
import { HealthProfessionals as HealthProfessionalsService, HealthProfessional } from '../../services/health-professionals';
import { Auth as AuthService } from '../../services/auth';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Pagination } from '../../components/pagination/pagination';

const PAGE_SIZE = 5;

@Component({
  selector: 'app-patients',
  imports: [RouterLink, DatePipe, Pagination],
  templateUrl: './patients.html',
  styleUrl: './patients.scss',
})
export class Patients implements OnInit {
  patients = signal<Patient[]>([]);
  healthProfessionals = signal<HealthProfessional[]>([]);
  currentPage = signal(1);

  // menu de ações por linha: em vez de mostrar os 6 botões sempre visíveis
  // (o que obrigava a tabela a rolar pro lado), um botão só que abre um menu
  // flutuante -- mesmo padrão já usado em Configurações > Pacientes
  openActionsFor = signal<string | null>(null);
  actionsMenuPosition = signal<{ top: number; left: number }>({ top: 0, left: 0 });

  searchTerm = signal('');
  priorityFilter = signal<'all' | Patient['priority']>('all');
  alertFilter = signal<'all' | NonNullable<Patient['alertLevel']>>('all');
  activeFilter = signal<'all' | 'active' | 'inactive'>('all');

  filteredPatients = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const priority = this.priorityFilter();
    const alert = this.alertFilter();
    const active = this.activeFilter();

    return this.patients().filter((patient) => {
      if (search && !patient.name.toLowerCase().includes(search)) return false;
      if (priority !== 'all' && patient.priority !== priority) return false;
      if (alert !== 'all' && patient.alertLevel !== alert) return false;
      if (active === 'active' && !patient.active) return false;
      if (active === 'inactive' && patient.active) return false;
      return true;
    });
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.filteredPatients().length / PAGE_SIZE)));

  pagedPatients = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filteredPatients().slice(start, start + PAGE_SIZE);
  });

  patientDeleteError = signal("");
  patientToDelete = signal<Patient | null>(null);
  deletingPatient = signal(false);

  constructor(
    private patientsService: PatientsService,
    private healthProfessionalsService: HealthProfessionalsService,
    private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.loadPatients();
    this.healthProfessionalsService.list().subscribe((data) => {
      this.healthProfessionals.set(data);
    });
  }

  // nome do profissional pra mostrar nas colunas de ACS/Médico/Enfermeiro —
  // em branco quando o paciente não tem ninguém naquela função ainda
  professionalName(id: string): string {
    if (!id) return '';
    return this.healthProfessionals().find((p) => p.id === id)?.name ?? '';
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
    const left = Math.min(rect.left, window.innerWidth - menuWidth - 8);

    // abre embaixo do botão primeiro (caso mais comum) -- a altura real do
    // menu só existe depois que ele for renderizado, então corrige pra
    // cima logo em seguida (setTimeout roda só depois do DOM atualizar)
    // se não couber embaixo. Sem isso, ou chuta uma altura (impreciso, fica
    // com espaço sobrando) ou corta o menu perto do fim da tela -- e como o
    // scroll fecha o menu (ver onDocumentInteraction), não dá nem pra rolar
    // a página até o resto dele
    this.actionsMenuPosition.set({ top: rect.bottom + 4, left });
    this.openActionsFor.set(patientId);

    setTimeout(() => {
      const menu = document.querySelector('.actions-menu') as HTMLElement | null;
      if (!menu) return;

      const menuHeight = menu.getBoundingClientRect().height;
      if (rect.bottom + menuHeight + 4 > window.innerHeight) {
        this.actionsMenuPosition.set({ top: Math.max(8, rect.top - menuHeight - 4), left });
      }
    });
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

  private loadPatients(): void {
    this.patientsService.list().subscribe((data) => {
      this.patients.set(data);
    });
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  // mesma lógica da tela de Usuários: pede confirmação num modal do próprio
  // site antes de excluir, já que também apaga o histórico de visitas e
  // IVCF-20 do paciente e não tem como desfazer.
  askDeletePatient(patient: Patient): void {
    this.patientDeleteError.set("");
    this.patientToDelete.set(patient);
  }

  cancelDeletePatient(): void {
    if (this.deletingPatient()) return;
    this.patientToDelete.set(null);
    this.patientDeleteError.set("");
  }

  confirmDeletePatient(): void {
    const patient = this.patientToDelete();
    if (!patient) return;

    this.deletingPatient.set(true);
    this.patientDeleteError.set("");

    this.patientsService.delete(patient.id).subscribe({
      next: () => {
        this.deletingPatient.set(false);
        this.patientToDelete.set(null);
        this.loadPatients();
      },
      error: () => {
        this.deletingPatient.set(false);
        this.patientDeleteError.set("Não foi possível excluir o paciente. Tente novamente.");
      },
    });
  }

  onSearchChange(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  onPriorityFilterChange(event: Event): void {
    this.priorityFilter.set((event.target as HTMLSelectElement).value as 'all' | Patient['priority']);
    this.currentPage.set(1);
  }

  onAlertFilterChange(event: Event): void {
    this.alertFilter.set((event.target as HTMLSelectElement).value as 'all' | NonNullable<Patient['alertLevel']>);
    this.currentPage.set(1);
  }

  onActiveFilterChange(event: Event): void {
    this.activeFilter.set((event.target as HTMLSelectElement).value as 'all' | 'active' | 'inactive');
    this.currentPage.set(1);
  }

  alertLabel(level: Patient['alertLevel']): string {
    switch (level) {
      case 'critical': return 'Crítico';
      case 'overdue': return 'Atrasado';
      case 'upcoming': return 'Em breve';
      case 'ok': return 'Em dia';
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
}