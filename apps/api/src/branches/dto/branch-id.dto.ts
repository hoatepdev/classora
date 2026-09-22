import { Matches } from 'class-validator';
export class BranchIdDto { @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/) id!: string; }
