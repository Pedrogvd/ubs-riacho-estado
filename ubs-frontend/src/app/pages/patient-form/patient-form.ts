import { Component, OnInit, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Patients as PatientsService, CreatePatientInput, UpdatePatientInput } from '../../services/patients';
import { HealthProfessionals as HealthProfessionalsService, HealthProfessional } from '../../services/health-professionals';
import { Conditions as ConditionsService, Condition } from '../../services/conditions';
import { Auth as AuthService } from '../../services/auth';

export const CONDITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'hypertension', label: 'Hipertensão' },
  { value: 'pregnant', label: 'Gestante' },
  { value: 'postpartum', label: 'Puérpera' },
  { value: 'child_under_2', label: 'Criança menor de 2 anos' },
  { value: 'bedridden_elderly', label: 'Idoso acamado' },
  { value: 'frail_elderly', label: 'Idoso frágil' },
  { value: 'physical_disability', label: 'Deficiência física' },
  { value: 'mental_disorder', label: 'Transtorno mental' },
  { value: 'tuberculosis', label: 'Tuberculose' },
  { value: 'leprosy', label: 'Hanseníase' },
  { value: 'substance_dependency', label: 'Dependência química' },
];

// uma linha da tabela de condições: tanto faz se é fixa (checkbox de sempre)
// ou personalizada ("Outro") -- a UI trata as duas igual, só muda de onde
// vem o "value" (o enum fixo ou o id da condição personalizada)
interface ConditionRow {
  kind: 'fixed' | 'custom';
  value: string;
  label: string;
}

// "AAAA-MM-DD" (data pura, sem hora) a partir de um Date, usando os
// componentes LOCAIS (não toISOString(), que usa UTC e, no horário de
// Brasília, pode "adiantar" a data em até 3h perto da meia-noite — foi
// exatamente esse tipo de bug que corrigimos no formulário do IVCF-20).
function toLocalDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Interpreta "AAAA-MM-DD" como meia-noite no fuso LOCAL. new Date("AAAA-MM-DD")
// sem isso trata a string como UTC, o que no horário de Brasília "atrasa" a
// data em até 3h — o mesmo problema, só que ao ler a data em vez de salvar.
function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Validator customizado: rejeita datas depois de hoje
function notFutureDateValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) {
    return null;
  }

  const inputDate = parseLocalDate(control.value);
  const today = parseLocalDate(toLocalDateString(new Date()));

  return inputDate > today ? { futureDate: true } : null;
}

// Validator do form inteiro: exige que pelo menos um dos dois identificadores
// (CPF ou CNS) tenha sido selecionado pelo usuário pra informar
function atLeastOneIdentifierValidator(group: AbstractControl): ValidationErrors | null {
  const informCpf = group.get('informCpf')?.value;
  const informCns = group.get('informCns')?.value;
  return informCpf || informCns ? null : { missingIdentifier: true };
}

// Mensagem de erro por campo, indexada pela chave do erro (required, pattern, futureDate...)
const FIELD_ERROR_MESSAGES: Record<string, Record<string, string>> = {
  name: { required: 'Nome é obrigatório' },
  cpf: { required: 'CPF é obrigatório', pattern: 'CPF deve ter 11 dígitos' },
  address: { required: 'Endereço é obrigatório' },
  phoneNumber: { required: 'Telefone é obrigatório', pattern: 'Telefone deve ter 10 ou 11 dígitos (com DDD)' },
  dateOfBirth: { required: 'Data de nascimento é obrigatória', futureDate: 'Data de nascimento não pode ser no futuro' },
  cns: { required: 'CNS é obrigatório', pattern: 'CNS deve ter 15 dígitos' },
  priority: { required: 'Prioridade é obrigatória' },
  visitPeriodicityDays: { required: 'Periodicidade é obrigatória' },
};

@Component({
  selector: 'app-patient-form',
  imports: [ReactiveFormsModule],
  templateUrl: './patient-form.html',
  styleUrl: './patient-form.scss',
})
export class PatientForm implements OnInit {
  form;
  selectedConditions: string[] = [];

  // "Outro": condições personalizadas, cadastradas por qualquer profissional
  // e reutilizáveis entre pacientes (em vez de cada um digitar um texto
  // livre diferente pra mesma condição). customConditions() é a lista
  // inteira; selectedCustomConditions() são as que esse paciente tem
  // marcadas.
  customConditions = signal<Condition[]>([]);
  selectedCustomConditions = signal<Condition[]>([]);
  customConditionInput = signal('');
  customConditionError = signal<string | null>(null);
  private pendingCustomConditionIds: string[] = [];

  // condições personalizadas criadas por ESTE profissional durante esta
  // mesma sessão do formulário (via "Outro" aqui embaixo) -- só essas
  // ganham um "excluir" do lado na tabela, pra corrigir rápido um erro de
  // digitação sem precisar ser admin nem ir em Configurações. Qualquer
  // outra condição personalizada (criada antes, por qualquer um) só pode
  // ser excluída por um admin, em Configurações > Condições.
  justCreatedConditionIds = signal<Set<string>>(new Set());
  deletingConditionId = signal<string | null>(null);
  conditionDeleteError = signal<string | null>(null);

  // tabela única de condições (fixas + personalizadas), com busca -- junta
  // CONDITION_OPTIONS (sempre as mesmas) com customConditions() (dinâmico)
  conditionFilter = signal('');

  allConditionRows = computed<ConditionRow[]>(() => [
    ...CONDITION_OPTIONS.map((option) => ({ kind: 'fixed' as const, value: option.value, label: option.label })),
    ...this.customConditions().map((condition) => ({ kind: 'custom' as const, value: condition.id, label: condition.label })),
  ]);

  filteredConditionRows = computed(() => {
    const query = this.conditionFilter().trim().toLowerCase();
    const rows = this.allConditionRows();
    if (!query) return rows;
    return rows.filter((row) => row.label.toLowerCase().includes(query));
  });

  healthProfessionals = signal<HealthProfessional[]>([]);
  today = toLocalDateString(new Date()); // pro atributo max do input date

  activeHealthProfessionals = computed(() => this.healthProfessionals().filter((p) => p.active));
  chwOptions = computed(() => this.activeHealthProfessionals().filter((p) => p.specialty === 'chw'));
  doctorOptions = computed(() => this.activeHealthProfessionals().filter((p) => p.specialty === 'doctor'));
  nurseOptions = computed(() => this.activeHealthProfessionals().filter((p) => p.specialty === 'nurse'));

  isEditMode = signal(false);
  submitted = signal(false);
  saving = signal(false);
  saveError = signal<string | null>(null);
  // aviso de possível duplicado por nome + data de nascimento: não bloqueia,
  // só pede confirmação antes de criar mesmo assim (ver forceCreate)
  possibleDuplicateWarning = signal<string | null>(null);
  private pendingCreateInput: CreatePatientInput | null = null;
  private patientId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private patientsService: PatientsService,
    private healthProfessionalsService: HealthProfessionalsService,
    private conditionsService: ConditionsService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = this.fb.nonNullable.group({
      name: ['', Validators.required],
      informCpf: [true],
      cpf: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
      informCns: [false],
      cns: ['', Validators.pattern(/^\d{15}$/)],
      address: ['', Validators.required],
      phoneNumber: ['', [Validators.required, Validators.pattern(/^\d{10,11}$/)]],
      dateOfBirth: ['', [Validators.required, notFutureDateValidator]],
      priority: ['' as 'high' | 'medium' | 'low' | ''],
      visitPeriodicityDays: [30],
      microarea: [''],
      communityHealthWorkerId: [''],
      doctorId: [''],
      nurseId: [''],
      active: [true],
    }, { validators: atLeastOneIdentifierValidator });

    this.updateIdentifierValidators();
  }

  ngOnInit(): void {
    this.conditionsService.list().subscribe((data) => {
      this.customConditions.set(data);
      this.resolveSelectedCustomConditions();
    });

    this.healthProfessionalsService.list().subscribe((data) => {
      this.healthProfessionals.set(data);

      // ao criar um paciente novo, já deixa pré-selecionado o próprio
      // profissional logado no campo que combina com a função clínica dele
      // (ex.: um enfermeiro cadastrando já aparece como enfermeiro responsável),
      // mas ele pode trocar livremente antes de salvar
      if (!this.isEditMode()) {
        const self = data.find((p) => p.id === this.authService.getProfessionalId());
        if (self?.specialty === 'chw') this.form.patchValue({ communityHealthWorkerId: self.id });
        if (self?.specialty === 'doctor') this.form.patchValue({ doctorId: self.id });
        if (self?.specialty === 'nurse') this.form.patchValue({ nurseId: self.id });
      }
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.isEditMode.set(true);
    this.patientId = id;

    this.patientsService.getById(id).subscribe((patient) => {
      // separa as condições fixas (checkboxes) das personalizadas ("Outro")
      // -- as personalizadas chegam como id, e só dá pra resolver o label
      // delas depois que customConditions() carregar (pedido à parte,
      // acima, que pode terminar antes ou depois deste)
      const fixedValues = new Set(CONDITION_OPTIONS.map((option) => option.value));
      this.selectedConditions = patient.conditions.filter((c) => fixedValues.has(c));
      this.pendingCustomConditionIds = patient.conditions.filter((c) => !fixedValues.has(c));
      this.resolveSelectedCustomConditions();

      this.form.patchValue({
        name: patient.name,
        informCpf: !!patient.cpf,
        cpf: patient.cpf,
        informCns: !!patient.cns,
        cns: patient.cns,
        address: patient.address,
        phoneNumber: patient.phoneNumber,
        dateOfBirth: patient.dateOfBirth,
        priority: patient.priority,
        visitPeriodicityDays: patient.visitPeriodicityDays,
        microarea: patient.microarea,
        communityHealthWorkerId: patient.communityHealthWorkerId,
        doctorId: patient.doctorId,
        nurseId: patient.nurseId,
        active: patient.active,
      });
      this.updateIdentifierValidators();
    });
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  onConditionFilterChange(event: Event): void {
    this.conditionFilter.set((event.target as HTMLInputElement).value);
  }

  isRowSelected(row: ConditionRow): boolean {
    if (row.kind === 'fixed') return this.selectedConditions.includes(row.value);
    return this.selectedCustomConditions().some((c) => c.id === row.value);
  }

  restrictToDigits(controlName: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digitsOnly = input.value.replace(/\D/g, '');
    input.value = digitsOnly;
    this.form.get(controlName)?.setValue(digitsOnly, { emitEvent: false });
  }

  formatCpf(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digitsOnly = input.value.replace(/\D/g, '').slice(0, 11);

    this.form.get('cpf')?.setValue(digitsOnly, { emitEvent: false });

    let formatted = digitsOnly;
    if (digitsOnly.length > 9) {
      formatted = `${digitsOnly.slice(0, 3)}.${digitsOnly.slice(3, 6)}.${digitsOnly.slice(6, 9)}-${digitsOnly.slice(9)}`;
    } else if (digitsOnly.length > 6) {
      formatted = `${digitsOnly.slice(0, 3)}.${digitsOnly.slice(3, 6)}.${digitsOnly.slice(6)}`;
    } else if (digitsOnly.length > 3) {
      formatted = `${digitsOnly.slice(0, 3)}.${digitsOnly.slice(3)}`;
    }

    input.value = formatted;
  }

  // Mesma lógica do formatCpf: guarda só os dígitos no form, mostra formatado no input
  formatPhone(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digitsOnly = input.value.replace(/\D/g, '').slice(0, 11);

    this.form.get('phoneNumber')?.setValue(digitsOnly, { emitEvent: false });

    let formatted = digitsOnly;
    if (digitsOnly.length > 10) {
      // celular: (31) 98888-7777
      formatted = `(${digitsOnly.slice(0, 2)}) ${digitsOnly.slice(2, 7)}-${digitsOnly.slice(7)}`;
    } else if (digitsOnly.length > 6) {
      // fixo: (31) 8888-7777
      formatted = `(${digitsOnly.slice(0, 2)}) ${digitsOnly.slice(2, 6)}-${digitsOnly.slice(6)}`;
    } else if (digitsOnly.length > 2) {
      formatted = `(${digitsOnly.slice(0, 2)}) ${digitsOnly.slice(2)}`;
    } else if (digitsOnly.length > 0) {
      formatted = `(${digitsOnly}`;
    }

    input.value = formatted;
  }

  isCpfInformed(): boolean {
    return this.form.get('informCpf')!.value;
  }

  isCnsInformed(): boolean {
    return this.form.get('informCns')!.value;
  }

  // Chamado quando o usuário marca/desmarca "Informar CPF" ou "Informar CNS".
  // O campo correspondente só fica obrigatório (e só participa da validação
  // de padrão) enquanto estiver marcado; ao desmarcar, o valor é limpo pra
  // não ir pro back-end um CPF/CNS desatualizado que o usuário escondeu.
  onToggleIdentifier(): void {
    this.updateIdentifierValidators();
  }

  private updateIdentifierValidators(): void {
    const cpfControl = this.form.get('cpf')!;
    const cnsControl = this.form.get('cns')!;

    if (this.isCpfInformed()) {
      cpfControl.setValidators([Validators.required, Validators.pattern(/^\d{11}$/)]);
    } else {
      cpfControl.setValidators([Validators.pattern(/^\d{11}$/)]);
      cpfControl.setValue('');
    }

    if (this.isCnsInformed()) {
      cnsControl.setValidators([Validators.required, Validators.pattern(/^\d{15}$/)]);
    } else {
      cnsControl.setValidators([Validators.pattern(/^\d{15}$/)]);
      cnsControl.setValue('');
    }

    cpfControl.updateValueAndValidity({ emitEvent: false });
    cnsControl.updateValueAndValidity({ emitEvent: false });
  }

  // uma linha só cuida das duas situações (fixa ou personalizada) -- o que
  // muda é só onde o "marcado" é guardado (selectedConditions ou
  // selectedCustomConditions)
  toggleRow(row: ConditionRow, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;

    if (row.kind === 'fixed') {
      if (checked) {
        this.selectedConditions = [...this.selectedConditions, row.value];
      } else {
        this.selectedConditions = this.selectedConditions.filter((c) => c !== row.value);
      }
      return;
    }

    if (checked) {
      const condition = this.customConditions().find((c) => c.id === row.value);
      if (condition) {
        this.selectedCustomConditions.update((list) =>
          list.some((c) => c.id === condition.id) ? list : [...list, condition]
        );
      }
    } else {
      this.selectedCustomConditions.update((list) => list.filter((c) => c.id !== row.value));
    }
  }

  // só true pra condição personalizada que ESTE profissional acabou de
  // criar agora, nesta mesma sessão do formulário (ver justCreatedConditionIds)
  isJustCreated(row: ConditionRow): boolean {
    return row.kind === 'custom' && this.justCreatedConditionIds().has(row.value);
  }

  // desfaz uma condição personalizada criada por engano agora mesmo --
  // some da tabela e da lista de selecionadas. Não precisa ser admin: o
  // backend permite porque é o próprio criador excluindo o que acabou de
  // criar (admin continua podendo excluir qualquer uma, em Configurações).
  deleteJustCreatedCondition(row: ConditionRow, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    this.deletingConditionId.set(row.value);
    this.conditionDeleteError.set(null);

    this.conditionsService.delete(row.value).subscribe({
      next: () => {
        this.deletingConditionId.set(null);
        this.customConditions.update((list) => list.filter((c) => c.id !== row.value));
        this.selectedCustomConditions.update((list) => list.filter((c) => c.id !== row.value));
        this.justCreatedConditionIds.update((set) => {
          const next = new Set(set);
          next.delete(row.value);
          return next;
        });
      },
      error: (err) => {
        this.deletingConditionId.set(null);
        this.conditionDeleteError.set(err?.error?.error || 'Não foi possível excluir essa condição. Tente novamente.');
      },
    });
  }

  // resolve os ids pendentes (vindos do paciente carregado) pros objetos
  // Condition completos, assim que a lista de condições personalizadas
  // estiver disponível -- chamado nos dois carregamentos (paciente e lista),
  // já que não dá pra saber qual dos dois termina primeiro
  private resolveSelectedCustomConditions(): void {
    if (this.pendingCustomConditionIds.length === 0) return;

    const byId = new Map(this.customConditions().map((c) => [c.id, c]));
    const resolved = this.pendingCustomConditionIds
      .map((id) => byId.get(id))
      .filter((c): c is Condition => !!c);

    if (resolved.length > 0) {
      this.selectedCustomConditions.set(resolved);
    }
  }

  onCustomConditionInputChange(event: Event): void {
    this.customConditionInput.set((event.target as HTMLInputElement).value);
    this.customConditionError.set(null);
  }

  // cadastra (ou reaproveita, se já existir com o mesmo nome) uma condição
  // personalizada via "Outro" e já marca ela pra esse paciente
  addCustomCondition(): void {
    const label = this.customConditionInput().trim();
    if (!label) return;

    const alreadySelected = this.selectedCustomConditions().some(
      (c) => c.label.trim().toLowerCase() === label.toLowerCase()
    );
    if (alreadySelected) {
      this.customConditionInput.set('');
      return;
    }

    this.conditionsService.create(label).subscribe({
      next: (condition) => {
        // se já existia (findOrCreateCustomCondition devolveu a mesma por
        // nome repetido), não é um erro de digitação dessa vez -- não deixa
        // excluir como se tivesse acabado de criar agora
        const existedBefore = this.customConditions().some((c) => c.id === condition.id);

        this.selectedCustomConditions.update((list) =>
          list.some((c) => c.id === condition.id) ? list : [...list, condition]
        );
        this.customConditions.update((list) =>
          list.some((c) => c.id === condition.id) ? list : [...list, condition]
        );
        if (!existedBefore) {
          this.justCreatedConditionIds.update((set) => new Set(set).add(condition.id));
        }
        this.customConditionInput.set('');
        this.customConditionError.set(null);
      },
      error: () => {
        this.customConditionError.set('Não foi possível adicionar essa condição. Tente novamente.');
      },
    });
  }


  // Retorna a mensagem de erro do campo, só depois que o usuário mexeu nele (touched)
  getError(controlName: string): string | null {
    const control = this.form.get(controlName);

    if (!control || !control.touched || !control.errors) {
      return null;
    }

    const messages = FIELD_ERROR_MESSAGES[controlName];
    const firstErrorKey = Object.keys(control.errors)[0];

    return messages?.[firstErrorKey] ?? 'Campo inválido';
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.saveError.set(null);
    this.possibleDuplicateWarning.set(null);
    this.pendingCreateInput = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched(); // garante que os erros apareçam mesmo se o submit disparar via Enter
      return;
    }

    // evita que clique duplo (ou Enter repetido) dispare mais de um
    // salvamento enquanto o primeiro ainda está em andamento
    if (this.saving()) {
      return;
    }
    this.saving.set(true);

    // informCpf/informCns só controlam a UI (quais campos aparecem/são
    // obrigatórios); a API não precisa deles, só dos valores de cpf/cns em si
    const { informCpf, informCns, ...value } = this.form.getRawValue();
    const destination = this.isAdmin() ? '/settings' : '/patients';

    // "conditions" vai pro back-end como uma lista só, misturando os valores
    // fixos (checkboxes) com os ids das condições personalizadas ("Outro")
    const combinedConditions = [
      ...this.selectedConditions,
      ...this.selectedCustomConditions().map((c) => c.id),
    ];

    if (this.isEditMode() && this.patientId) {
      const input: UpdatePatientInput = {
        ...value,
        conditions: combinedConditions,
      };

      this.patientsService.update(this.patientId, input).subscribe({
        next: () => this.router.navigate([destination]),
        error: (err) => {
          this.saving.set(false);
          this.saveError.set(err?.error?.error ?? 'Não foi possível salvar as alterações. Tente novamente.');
        },
      });
      return;
    }

    const input: CreatePatientInput = {
      ...value,
      conditions: combinedConditions,
    };

    this.patientsService.create(input).subscribe({
      next: () => this.router.navigate([destination]),
      error: (err) => {
        this.saving.set(false);

        if (err?.status === 409 && err?.error?.type === 'possible_duplicate') {
          // não é um erro fatal: guarda os dados já digitados e deixa a
          // pessoa confirmar que é uma pessoa diferente pra seguir mesmo assim
          this.pendingCreateInput = input;
          this.possibleDuplicateWarning.set(err.error.error);
          return;
        }

        this.saveError.set(err?.error?.error ?? 'Não foi possível salvar o paciente. Tente novamente.');
      },
    });
  }

  confirmDuplicateAndSave(): void {
    if (!this.pendingCreateInput || this.saving()) return;

    this.saving.set(true);
    const destination = this.isAdmin() ? '/settings' : '/patients';
    const input: CreatePatientInput = { ...this.pendingCreateInput, forceCreate: true };

    this.patientsService.create(input).subscribe({
      next: () => this.router.navigate([destination]),
      error: (err) => {
        this.saving.set(false);
        this.possibleDuplicateWarning.set(null);
        this.saveError.set(err?.error?.error ?? 'Não foi possível salvar o paciente. Tente novamente.');
      },
    });
  }

  cancelDuplicateWarning(): void {
    this.possibleDuplicateWarning.set(null);
    this.pendingCreateInput = null;
  }
}