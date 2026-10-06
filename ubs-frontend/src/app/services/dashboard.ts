import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DashboardSummary {
  overdueVisits: number;
  upcomingVisits7Days: number;
  visitsThisMonth: number;
  patientsTracked: number;
  patientsWithoutVisit30Days: number;
}

@Injectable({
  providedIn: 'root'
})

export class Dashboard {
  private readonly apiUrl = 'http://localhost:3000/dashboard';

  constructor(private http: HttpClient) { }
  /*
  getSummary() -> the way it's written there, is already a function, so I just need to call it.
  */
  getSummary(): Observable<DashboardSummary> { // An Observable means it's something that stays 'parked', waiting to be triggered. To trigger it, we use .subscribe()
    return this.http.get<DashboardSummary>(this.apiUrl);
  }
}
