import { Component, OnInit, signal, computed } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HealthProfessionals as HealthProfessionalsService, HealthProfessional, CreateHealthProfessionalInput, UpdateHealthProfessionalInput } from '../../services/health-professionals';
import { Auth as AuthService } from '../../services/auth';

const FIELD_ERROR_MESSAGES: Record<string, Record<string, string>> = {
  name: { required: 'Nome é obrigatório' },
  cpf: { required: 'CPF é obrigatório', pattern: 'CPF deve ter 11 dígitos' },
  address: { required: 'Endereço é obrigatório' },
  phoneNumber: { required: 'Telefone é obrigatório', pattern: 'Telefone deve ter 10 ou 11 dígitos (com DDD)' },
  email: { required: 'Email é obrigatório', email: 'Email inválido' },
  password: { required: 'Senha é obrigatória', minlength: 'Senha deve ter pelo menos 6 caracteres' },
};

@Component({
  selector: 'app-professional-form',
  imports: [ReactiveFormsModule],
  templateUrl: './professional-form.html',
  styleUrl: './professional-form.scss',
})
export class ProfessionalForm implements OnInit {
  form;
  isEditMode = signal(false);
  professional = signal<HealthProfessional | null>(null);
  private professionalId: string | null = null;

  resetPasswordResult = signal<string | null>(null);
  resetPasswordError = signal('');
  accountActionError = signal('');

  // admin editando o próprio perfil não pode mexer no próprio role/status
  isSelf = computed(() => this.professional()?.id === this.authService.getProfessionalId());

  constructor(
    private fb: FormBuilder,
    private healthProfessionalsService: HealthProfessionalsService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = this.fb.nonNullable.group({
      name: ['', Validators.required],
      cpf: ['', [Validators.required, Validators.pattern(/^\d{11}$/)]],
      address: [''],
      phoneNumber: ['', Validators.pattern(/^\d{10,11}$/)],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      // só usado na CRIAÇÃO -- na edição, a função clínica é trocada à parte
      // (ver onSpecialtyChange), com salvamento imediato, então esse campo
      // nunca é preenchido nem enviado no "Salvar alterações" (ver onSubmit)
      specialty: ['' as '' | 'chw' | 'doctor' | 'nurse'],
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    this.isEditMode.set(true);
    this.professionalId = id;

    // editar não troca senha por aqui, então tira a exigência de preencher
    this.form.controls.password.clearValidators();
    this.form.controls.password.updateValueAndValidity();

    this.loadProfessional(id);
  }

  roleLabel(role: HealthProfessional['role']): string {
    return role === 'admin' ? 'Admin' : 'Profissional';
  }

  specialtyLabel(specialty: HealthProfessional['specialty']): string {
    switch (specialty) {
      case 'chw': return 'ACS';
      case 'doctor': return 'Médico(a)';
      case 'nurse': return 'Enfermeiro(a)';
      default: return 'Não definida';
    }
  }

  onSpecialtyChange(event: Event): void {
    if (!this.professionalId) return;
    const value = (event.target as HTMLSelectElement).value as HealthProfessional['specialty'];

    this.accountActionError.set('');
    this.healthProfessionalsService.update(this.professionalId, { specialty: value }).subscribe({
      next: () => this.loadProfessional(this.professionalId!),
      // se der erro, recarrega o valor real do servidor — senão o <select>
      // fica mostrando a opção que a pessoa clicou, mesmo sem ter sido salva
      error: () => {
        this.accountActionError.set('Não foi possível salvar a função clínica. Tente novamente.');
        this.loadProfessional(this.professionalId!);
      },
    });
  }

  toggleRole(): void {
    const current = this.professional();
    if (!current || !this.professionalId) return;

    const newRole = current.role === 'admin' ? 'professional' : 'admin';
    this.accountActionError.set('');
    this.healthProfessionalsService.update(this.professionalId, { role: newRole }).subscribe({
      next: () => this.loadProfessional(this.professionalId!),
      error: () => {
        this.accountActionError.set('Não foi possível salvar o perfil de acesso. Tente novamente.');
        this.loadProfessional(this.professionalId!);
      },
    });
  }

  toggleActive(): void {
    const current = this.professional();
    if (!current || !this.professionalId) return;

    this.accountActionError.set('');
    this.healthProfessionalsService.update(this.professionalId, { active: !current.active }).subscribe({
      next: () => this.loadProfessional(this.professionalId!),
      error: () => {
        this.accountActionError.set('Não foi possível salvar o status da conta. Tente novamente.');
        this.loadProfessional(this.professionalId!);
      },
    });
  }

  // admin reseta a senha de outra pessoa; o backend gera uma temporária e devolve ela aqui,
  // já que não existe envio de email pra entregar a senha nova direto pro profissional
  resetPassword(): void {
    if (!this.professionalId) return;

    this.resetPasswordError.set('');
    this.resetPasswordResult.set(null);

    this.healthProfessionalsService.resetPassword(this.professionalId).subscribe({
      next: (response) => {
        this.resetPasswordResult.set(response.temporaryPassword ?? null);
      },
      error: () => {
        this.resetPasswordError.set('Não foi possível resetar a senha.');
      },
    });
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

  formatPhone(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digitsOnly = input.value.replace(/\D/g, '').slice(0, 11);

    this.form.get('phoneNumber')?.setValue(digitsOnly, { emitEvent: false });

    let formatted = digitsOnly;
    if (digitsOnly.length > 10) {
      formatted = `(${digitsOnly.slice(0, 2)}) ${digitsOnly.slice(2, 7)}-${digitsOnly.slice(7)}`;
    } else if (digitsOnly.length > 6) {
      formatted = `(${digitsOnly.slice(0, 2)}) ${digitsOnly.slice(2, 6)}-${digitsOnly.slice(6)}`;
    } else if (digitsOnly.length > 2) {
      formatted = `(${digitsOnly.slice(0, 2)}) ${digitsOnly.slice(2)}`;
    } else if (digitsOnly.length > 0) {
      formatted = `(${digitsOnly}`;
    }

    input.value = formatted;
  }

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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // "specialty" sai separado de "rest": na edição, quem muda a função
    // clínica é onSpecialtyChange (salva na hora), então o PATCH daqui não
    // pode mandar junto -- senão reseta a função pra "Não definida" toda
    // vez que a pessoa salvar o resto do cadastro
    const { password, specialty, ...rest } = this.form.getRawValue();

    if (this.isEditMode() && this.professionalId) {
      const input: UpdateHealthProfessionalInput = rest;

      this.healthProfessionalsService.update(this.professionalId, input).subscribe(() => {
        this.router.navigate(['/settings']);
      });
      return;
    }

    const input: CreateHealthProfessionalInput = { ...rest, password, specialty };

    this.healthProfessionalsService.create(input).subscribe(() => {
      this.router.navigate(['/settings']);
    });
  }

  private loadProfessional(id: string): void {
    this.healthProfessionalsService.getById(id).subscribe((professional) => {
      this.professional.set(professional);
      // alguns cadastros antigos foram salvos com CPF/telefone já formatados
      // (com pontos, traço, parênteses); tira a formatação ao carregar, senão
      // o validador (que só aceita dígitos) marca o campo como inválido sem
      // o usuário ter mexido em nada
      this.form.patchValue({
        name: professional.name,
        cpf: professional.cpf.replace(/\D/g, ''),
        address: professional.address,
        phoneNumber: professional.phoneNumber.replace(/\D/g, ''),
        email: professional.email,
      });
    });
  }
}