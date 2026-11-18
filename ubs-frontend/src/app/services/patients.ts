import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Patient {
  id: string;
  name: string;
  cpf: string;
  address: string;
  phoneNumber: string;
  additionalPhoneNumbers: string[];
  dateOfBirth: string;
  priority: "urgent" | "high" | "medium" | "low" | "";
  conditions: string[];
  visitPeriodicityDays: number;
  active: boolean;
  createdAt: string;
  lastVisitAt: string | null;
  nextVisitDue: string | null;
  alertLevel?: "critical" | "overdue" | "upcoming" | "ok" | "";
  cns: string;
  microarea: string;
  communityHealthWorkerId: string;
  doctorId: string;
  nurseId: string;
}

export interface CreatePatientInput {
  name: string;
  cpf: string;
  address: string;
  phoneNumber: string;
  additionalPhoneNumbers: string[];
  dateOfBirth: string;
  priority: "urgent" | "high" | "medium" | "low" | "";
  conditions: string[];
  visitPeriodicityDays: number;
  cns: string;
  microarea: string;
  communityHealthWorkerId: string;
  doctorId: string;
  nurseId: string;
  // true pra confirmar que é uma pessoa diferente e seguir mesmo depois de
  // receber o aviso de possível duplicado por nome + data de nascimento
  forceCreate?: boolean;
}

export interface UpdatePatientInput {
  name?: string;
  cpf?: string;
  address?: string;
  phoneNumber?: string;
  additionalPhoneNumbers?: string[];
  dateOfBirth?: string;
  priority?: "urgent" | "high" | "medium" | "low" | "";
  conditions?: string[];
  visitPeriodicityDays?: number;
  cns?: string;
  microarea?: string;
  communityHealthWorkerId?: string;
  doctorId?: string;
  nurseId?: string;
  active?: boolean;
}

@Injectable({
  providedIn: 'root',
})

export class Patients {
  private readonly apiUrl = `${environment.apiUrl}/patients`;
  constructor(private http: HttpClient) { }

  list(): Observable<Patient[]> {
    return this.http.get<Patient[]>(this.apiUrl);
  }

  getById(id: string): Observable<Patient> {
    return this.http.get<Patient>(`${this.apiUrl}/${id}`)
  }

  create(input: CreatePatientInput): Observable<Patient> {
    return this.http.post<Patient>(this.apiUrl, input);
  }

  update(id: string, changes: UpdatePatientInput): Observable<Patient> {
    return this.http.patch<Patient>(`${this.apiUrl}/${id}`, changes);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}