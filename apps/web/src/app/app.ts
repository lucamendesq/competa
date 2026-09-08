import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toasts } from './core/ui/toast';

@Component({
  imports: [RouterOutlet, Toasts],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}
