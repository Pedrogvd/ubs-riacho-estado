import { Component, OnInit, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Patients as PatientsService, Patient } from '../../services/patients';
import { Visits as VisitsService, CreateVisitInput } from '../../services/visits';

function notFutureDateValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) {
    return null;
  }

  const inputDate = new Date(control.value);
  return inputDate > new Date() ? { futureDate: true } : null;
}

// a "próxima visita prevista" é digitada à mão por quem registra a visita
// (não é mais calculada automaticamente a partir da periodicidade) -- mas
// precisa ser hoje ou no futuro (não faz sentido "prever" uma próxima
// visita no passado), e também não pode ser antes da data da visita que
// acabou de ser registrada
function nextVisitNotPastValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inputDate = new Date(control.value);
  return inputDate < today ? { pastDate: true } : null;
}

function nextVisitNotBeforeVisitDateValidator(group: AbstractControl): ValidationErrors | null {
  const visitDate = group.get('visitDate')?.value;
  const nextVisitDue = group.get('nextVisitDue')?.value;

  if (!visitDate || !nextVisitDue) {
    return null;
  }

  return new Date(nextVisitDue) < new Date(visitDate) ? { nextVisitBeforeVisit: true } : null;
}

function toDateTimeLocalString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

@Component({
  selector: 'app-visit-form',
  imports: [ReactiveFormsModule],
  templateUrl: './visit-form.html',
  styleUrl: './visit-form.scss',
})
export class VisitForm implements OnInit {
  patient = signal<Patient | null>(null);
  patientId!: string;
  now = toDateTimeLocalString(new Date()); // trava o input no presente e já vem pré-preenchido
  today = toDateString(new Date()); // trava a "próxima visita" pra não deixar escolher data passada

  form;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private patientsService: PatientsService,
    private visitsService: VisitsService
  ) {
    this.form = this.fb.nonNullable.group(
      {
        visitDate: [this.now, [Validators.required, notFutureDateValidator]],
        outcome: ['completed' as 'completed' | 'patient_absent' | 'refused', Validators.required],
        nextVisitDue: [''],
        bloodPressure: [''],
        weightKg: [null as number | null],
        bloodGlucoseMgDl: [null as number | null],
        needsReferral: [false],
        referredTo: [''],
        notes: [''],
      },
      { validators: nextVisitNotBeforeVisitDateValidator }
    );

    // "próxima visita prevista" só é exigida quando a visita foi de fato
    // realizada -- paciente ausente/recusou não tem base pra prever a próxima
    this.form.controls.outcome.valueChanges.subscribe(() => this.updateNextVisitDueValidator());
    this.updateNextVisitDueValidator();
  }

  private updateNextVisitDueValidator(): void {
    const control = this.form.controls.nextVisitDue;

    // próxima visita prevista é opcional -- só valida que, SE preenchida,
    // não pode ser no passado; não exige mais que seja preenchida
    if (this.form.controls.outcome.value === 'completed') {
      control.setValidators([nextVisitNotPastValidator]);
    } else {
      control.setValidators([]);
      control.setValue('');
    }

    control.updateValueAndValidity({ emitEvent: false });
  }

  ngOnInit(): void {
    this.patientId = this.route.snapshot.paramMap.get('patientId')!;

    this.patientsService.getById(this.patientId).subscribe((data) => {
      this.patient.set(data);
    });
  }

  nextVisitDueError(): string | null {
    const control = this.form.get('nextVisitDue');

    if (!control || !control.touched) {
      return null;
    }

    if (control.errors?.['pastDate']) return 'Próxima visita não pode ser no passado -- escolha hoje ou uma data futura';
    if (this.form.errors?.['nextVisitBeforeVisit']) return 'Próxima visita não pode ser antes da data da visita';
    return null;
  }

  visitDateError(): string | null {
    const control = this.form.get('visitDate');

    if (!control || !control.touched || !control.errors) {
      return null;
    }

    if (control.errors['required']) return 'Data e hora da visita são obrigatórias';
    if (control.errors['futureDate']) return 'Data e hora da visita não podem ser no futuro';
    return 'Data inválida';
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    const input: CreateVisitInput = {
      patientId: this.patientId,
      visitDate: value.visitDate,
      // '' vira null -- o backend indexa isso num campo "date" do
      // elasticsearch, que quebra se receber string vazia (só aceita
      // valor real ou null)
      nextVisitDue: value.nextVisitDue || null,
      outcome: value.outcome,
      bloodPressure: value.bloodPressure,
      weightKg: value.weightKg,
      bloodGlucoseMgDl: value.bloodGlucoseMgDl,
      needsReferral: value.needsReferral,
      referredTo: value.needsReferral ? value.referredTo : '',
      notes: value.notes,
    };

    this.visitsService.create(input).subscribe(() => {
      this.router.navigate(['/patients']);
    });
  }
}