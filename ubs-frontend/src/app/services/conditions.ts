import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// condição personalizada (a opção "Outro" do formulário de paciente),
// cadastrada por qualquer profissional e reutilizável entre pacientes
export interface Condition {
  id: string;
  label: string;
  createdBy: string;
  createdAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class Conditions {
  private readonly apiUrl = `${environment.apiUrl}/conditions`;
  constructor(private http: HttpClient) {}

  list(): Observable<Condition[]> {
    return this.http.get<Condition[]>(this.apiUrl);
  }

  // cria uma condição nova OU devolve a que já existe com o mesmo nome
  create(label: string): Observable<Condition> {
    return this.http.post<Condition>(this.apiUrl, { label });
  }

  // só admin pode excluir (backend bloqueia se algum paciente ainda usa)
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
