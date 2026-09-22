import { PartialType } from '@nestjs/swagger';
import { CreateBranchDto } from './create-branch.dto.js';
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}
