import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface HealthProfessional {
  id: string;
  name: string;
  cpf: string;
  address: string;
  phoneNumber: string;
  email: string;
  role: 'admin' | 'professional';
  active: boolean;
  createdAt: string;
}

export interface CreateHealthProfessionalInput {
  name: string;
  cpf: string;
  address: string;
  phoneNumber: string;
  email: string;
  password: string;
}

export interface UpdateHealthProfessionalInput {
  role?: 'admin' | 'professional';
  active?: boolean;
  name?: string;
  cpf?: string;
  address?: string;
  phoneNumber?: string;
  email?: string;
}

@Injectable({
  providedIn: 'root',
})
export class HealthProfessionals {
  private readonly apiUrl = `${environment.apiUrl}/health-professionals`;
  constructor(private http: HttpClient) { }

  list(): Observable<HealthProfessional[]> {
    return this.http.get<HealthProfessional[]>(this.apiUrl);
  }

  getById(id: string): Observable<HealthProfessional> {
    return this.http.get<HealthProfessional>(`${this.apiUrl}/${id}`);
  }

  create(input: CreateHealthProfessionalInput): Observable<HealthProfessional> {
    return this.http.post<HealthProfessional>(this.apiUrl, input);
  }

  update(id: string, changes: UpdateHealthProfessionalInput): Observable<HealthProfessional> {
    return this.http.patch<HealthProfessional>(`${this.apiUrl}/${id}`, changes);
  }
}