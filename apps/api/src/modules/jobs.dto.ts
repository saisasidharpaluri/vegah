import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateJobDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}
