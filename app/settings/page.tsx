'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { DashboardProvider, useDashboard } from '@/components/dashboard/dashboard-context';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmActionDialog } from '@/components/ui/confirm-dialog';
import { Key, Copy, Check, RefreshCw, AlertTriangle, ShieldCheck, Trash2, Eye, EyeOff, Pencil, X, Sparkles, Bot, Code2 } from 'lucide-react';

function SettingsContent() {
  const {
    selectedProject,
    selectedProjectId,
    handleUpdateProjectName,
    handleResetToken,
    handleDeleteProject,
    copyToClipboard,
    copiedKey,
    user,
  } = useDashboard();

  const [isResetDialogOpen, setIsResetDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = React.useState<string | null>(null);
  const [showToken, setShowToken] = React.useState(false);
  const [showAccountToken, setShowAccountToken] = React.useState(false);

  // Rename project state
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [nameInput, setNameInput] = React.useState('');
  const [isSavingName, setIsSavingName] = React.useState(false);

  React.useEffect(() => {
    if (selectedProject) {
      setNameInput(selectedProject.name);
      setIsEditingName(false);
    }
  }, [selectedProject?.id, selectedProject?.name]);

  if (!selectedProject) {
    return (
      <div className="text-center p-8 text-sm text-muted-foreground">
        Проєкт не вибрано або його не знайдено.
      </div>
    );
  }

  const onSaveName = async () => {
    if (!nameInput.trim() || nameInput.trim() === selectedProject.name) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    try {
      const ok = await handleUpdateProjectName(selectedProject.id, nameInput.trim());
      if (ok) {
        setIsEditingName(false);
        setResetSuccessMessage('Назву проєкту успішно змінено!');
        setTimeout(() => setResetSuccessMessage(null), 4000);
      }
    } finally {
      setIsSavingName(false);
    }
  };

  const onConfirmReset = async () => {
    setIsResetting(true);
    try {
      const newToken = await handleResetToken(selectedProjectId);
      if (newToken) {
        setIsResetDialogOpen(false);
        setResetSuccessMessage('Новий токен успішно згенеровано! Старий токен анульовано.');
        setShowToken(true);
        setTimeout(() => setResetSuccessMessage(null), 5000);
      }
    } finally {
      setIsResetting(false);
    }
  };

  const onConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await handleDeleteProject(selectedProject.id, selectedProject.name);
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Налаштування проєкту</h1>
      </div>

      {resetSuccessMessage && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2.5 text-xs text-emerald-400">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>{resetSuccessMessage}</span>
        </div>
      )}

      {/* Project General Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Загальна інформація</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Назва проєкту
                </label>
                {!isEditingName && (
                  <button
                    type="button"
                    onClick={() => {
                      setNameInput(selectedProject.name);
                      setIsEditingName(true);
                    }}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Змінити</span>
                  </button>
                )}
              </div>

              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSaveName();
                      if (e.key === 'Escape') setIsEditingName(false);
                    }}
                    disabled={isSavingName}
                    className="h-9 text-xs bg-background font-medium focus-visible:ring-primary"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={onSaveName}
                    disabled={isSavingName || !nameInput.trim()}
                    className="h-9 px-3 text-xs shrink-0 cursor-pointer"
                  >
                    {isSavingName ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      'Зберегти'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsEditingName(false)}
                    disabled={isSavingName}
                    className="h-9 w-9 shrink-0 cursor-pointer"
                    title="Скасувати"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="p-2.5 rounded-md border border-input bg-secondary/40 font-medium text-foreground flex items-center justify-between">
                  <span className="truncate">{selectedProject.name}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Project ID (UUID)
              </label>
              <div className="p-2.5 rounded-md border border-input bg-secondary/40 font-mono text-[11px] text-foreground flex items-center justify-between">
                <span className="truncate mr-2 select-all">{selectedProject.id}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => copyToClipboard(selectedProject.id, 'proj-id')}
                >
                  {copiedKey === 'proj-id' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
            <div>
              <span className="font-medium text-foreground mr-1">Створено:</span>
              <span className="font-mono">{new Date(selectedProject.created_at).toLocaleString('uk-UA')}</span>
            </div>
            <div>
              <span className="font-medium text-foreground mr-1">Останнє оновлення:</span>
              <span className="font-mono">{new Date(selectedProject.updated_at).toLocaleString('uk-UA')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Key & Token Management */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Авторизаційний токен (X-Token)</CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px]">
              Secret Key
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Секретний токен для передачі в заголовку <code className="font-mono text-foreground font-semibold">X-Token</code> при кожному API запиті.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Base API URL */}
          <div className="rounded-lg border border-input bg-secondary/50 p-3.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">
              Base API URL
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              <div className="font-mono text-xs text-foreground select-all truncate font-medium">
                {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787'}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs shrink-0 self-start sm:self-auto cursor-pointer"
                onClick={() => copyToClipboard(typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787', 'baseurl-settings')}
              >
                {copiedKey === 'baseurl-settings' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Скопійовано</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Копіювати URL</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Current Token */}
          <div className="rounded-lg border border-input bg-secondary/50 p-3.5">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Поточний токен мерчанта
              </span>
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                <span>{showToken ? 'Приховати' : 'Показати'}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              <div className="font-mono text-xs text-foreground select-all truncate font-medium">
                {showToken ? selectedProject.token : `${selectedProject.token.slice(0, 10)}••••••••••••••••••••••••`}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs shrink-0 self-start sm:self-auto cursor-pointer"
                onClick={() => copyToClipboard(selectedProject.token, 'xtoken-settings')}
              >
                {copiedKey === 'xtoken-settings' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Скопійовано</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Копіювати токен</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="text-xs text-muted-foreground max-w-md">
              Якщо токен було скомпрометовано або ви хочете оновити інтеграцію, згенеруйте новий ключ.
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsResetDialogOpen(true)}
              className="h-8 gap-1.5 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 shrink-0 self-start sm:self-auto cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Скинути токен
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Небезпечна зона
          </CardTitle>
          <CardDescription className="text-xs">
            Видалення проєкту призведе до незворотного видалення всіх рахунків та історії вебхуків.
          </CardDescription>
        </CardHeader>
        <CardFooter className="pt-2 flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="h-8 gap-1.5 text-xs cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Видалити проєкт
          </Button>
        </CardFooter>
      </Card>

      {/* Confirm Reset Token Dialog */}
      <ConfirmActionDialog
        open={isResetDialogOpen}
        onOpenChange={setIsResetDialogOpen}
        title="Підтвердження скидання токена"
        variant="warning"
        confirmButtonText="Скинути токен"
        confirmTextRequired={selectedProject.name}
        isLoading={isResetting}
        onConfirm={onConfirmReset}
        description={
          <>
            <p>
              Ви збираєтеся згенерувати новий секретний токен для проєкту <strong>{selectedProject.name}</strong>.
            </p>
            <p className="text-destructive font-medium">
              Попередній токен буде анульовано негайно! Усі підключені сервери або інтеграції мерчанта перестануть працювати з помилкою 403 Forbidden, доки токен не буде оновлено.
            </p>
          </>
        }
      />

      {/* Confirm Delete Project Dialog */}
      <ConfirmActionDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Видалення проєкту"
        variant="destructive"
        confirmButtonText="Видалити назавжди"
        confirmTextRequired={selectedProject.name}
        isLoading={isDeleting}
        onConfirm={onConfirmDelete}
        description={
          <>
            <p>
              Ця дія незворотна. Проєкт <strong>{selectedProject.name}</strong>, а також усі пов&apos;язані рахунки (invoices) та журнали вебхуків буде видалено без можливості відновлення.
            </p>
          </>
        }
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-muted-foreground">Завантаження налаштувань...</div>}>
      <DashboardProvider>
        <DashboardShell pageTitle="Налаштування">
          <SettingsContent />
        </DashboardShell>
      </DashboardProvider>
    </Suspense>
  );
}
