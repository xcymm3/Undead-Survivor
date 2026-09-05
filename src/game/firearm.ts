import { WEAPONS } from './weapons';
import type { WeaponDefinition } from './weapons';

export class Firearm {
  ammo: number;
  shots = 0;
  cooldown = 0;
  fireRemaining = 0;
  reloadRemaining = 0;
  reloadEmpty = false;
  private reloadTotal = 0;
  private reloadStartAmmo = 0;
  constructor(readonly definition: WeaponDefinition = WEAPONS[0]) { this.ammo = definition.capacity; }
  get reloading() { return this.reloadRemaining > 0; }
  get reloadProgress() { return this.reloading ? 1 - this.reloadRemaining / this.reloadTotal : 1; }
  get animationProgress() {
    if (!this.reloading) return 1;
    return this.definition.shellReload ? ((this.reloadTotal - this.reloadRemaining) / this.definition.reloadDuration) % 1 : this.reloadProgress;
  }
  get fireProgress() { return this.fireRemaining > 0 ? 1 - this.fireRemaining / this.definition.fireDuration : 1; }
  fire(): boolean {
    if (this.reloading || this.cooldown > 1e-8 || this.ammo === 0) return false;
    if (!this.definition.infiniteAmmo) this.ammo--;
    this.shots++;
    this.cooldown = this.definition.interval;
    this.fireRemaining = this.definition.fireDuration;
    return true;
  }
  reload(): boolean {
    if (this.definition.infiniteAmmo || this.definition.reloadDuration <= 0 || this.reloading || this.ammo === this.definition.capacity) return false;
    this.reloadEmpty = this.ammo === 0;
    this.reloadStartAmmo = this.ammo;
    this.reloadTotal = this.definition.reloadDuration * (this.definition.shellReload ? this.definition.capacity - this.ammo : 1);
    this.reloadRemaining = this.reloadTotal;
    this.fireRemaining = 0;
    return true;
  }
  update(delta: number) {
    this.cooldown = Math.max(0, this.cooldown - delta);
    this.fireRemaining = Math.max(0, this.fireRemaining - delta);
    if (this.reloading) {
      this.reloadRemaining = Math.max(0, this.reloadRemaining - delta);
      if (this.definition.shellReload) this.ammo = Math.min(this.definition.capacity, this.reloadStartAmmo + Math.floor((this.reloadTotal - this.reloadRemaining + 1e-8) / this.definition.reloadDuration));
      if (this.reloadRemaining === 0) this.ammo = this.definition.capacity;
    }
  }
  reset() {
    this.ammo = this.definition.capacity; this.shots = 0; this.cooldown = 0; this.fireRemaining = 0;
    this.reloadRemaining = 0; this.reloadTotal = 0; this.reloadEmpty = false;
  }
}
