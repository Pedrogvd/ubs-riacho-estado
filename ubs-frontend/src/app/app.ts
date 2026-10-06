import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { Auth as AuthService } from './services/auth';
import { Loading as LoadingService } from './services/loading';
import { SessionExpiredModal } from './components/session-expired-modal/session-expired-modal';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SessionExpiredModal],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('ubs-frontend');
  isLoggedIn;
  isLoading;
  mobileMenuOpen = signal(false);

  constructor(private authService: AuthService, private loadingService: LoadingService, private router: Router) {
    this.isLoggedIn = this.authService.isLoggedIn;
    this.isLoading = this.loadingService.isLoading;
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}