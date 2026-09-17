import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { Public, type AuthenticatedUser } from './auth.guard.js';
import { errorResponse, schemaRef } from '../openapi.js';
import { LoginDto } from './login.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  @ApiOkResponse({ schema: schemaRef('LoginResponse') })
  @ApiResponse({ status: 400, description: 'Invalid login input', ...errorResponse })
  @ApiResponse({ status: 401, description: 'Invalid credentials', ...errorResponse })
  login(@Body() input: LoginDto) {
    return this.auth.login(input.email, input.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ schema: schemaRef('CurrentUser') })
  @ApiResponse({ status: 401, description: 'Not authenticated', ...errorResponse })
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getCurrentUser(user);
  }
}
