# Interativa — Guia de Instalação no Servidor

## Pré-requisitos

- Servidor Linux com Docker + Portainer instalados
- Traefik rodando com a rede `network_public` criada
- Resolver Let's Encrypt configurado como `letsencryptresolver` no Traefik
- Registro DNS apontando o subdomínio para o IP do servidor

---

## 1. Criar o registro DNS

No painel do seu domínio, crie um registro do tipo **A**:

```
Tipo:  A
Nome:  interativa          (resulta em interativa.adrofecha.com.br)
Valor: IP_DO_SEU_SERVIDOR
TTL:   3600
```

Aguarde a propagação (geralmente menos de 5 minutos).

---

## 2. Verificar a rede network_public

A rede já existe se você tem outros serviços rodando no servidor. Para confirmar, rode no terminal do servidor:

```bash
docker network ls | grep network_public
```

Se não aparecer, crie:

```bash
docker network create network_public
```

---

## 3. Criar os volumes de dados

Os volumes guardam o banco de dados JSON e os arquivos de mídia enviados. Execute no terminal do servidor:

```bash
docker volume create interativa_data
docker volume create interativa_uploads
```

Para verificar se foram criados:

```bash
docker volume ls | grep interativa
```

---

## 4. Instalar pelo Portainer

### 4.1 Acessar a criação de Stack

**Portainer → Stacks → Add Stack**

---

### 4.2 Preencher os campos

| Campo | Valor |
|---|---|
| **Name** | `interativa` |
| **Build method** | `Repository` |
| **Repository URL** | `https://github.com/ramonrduarte/interativo.git` |
| **Repository reference** | `refs/heads/main` |
| **Compose path** | `docker-compose.yml` |
| **Authentication** | Desligado (repositório público) |

---

### 4.3 Variáveis de ambiente

Role a página até **Environment variables** e adicione:

| Variable | Value |
|---|---|
| `DOMAIN` | `interativa.adrofecha.com.br` |
| `NODE_ENV` | `production` |
| `PORT` | `3001` |

> Troque o valor de `DOMAIN` pelo subdomínio que você criou no DNS.

---

### 4.4 Fazer o deploy

Clique em **Deploy the stack**.

O Portainer vai:
1. Clonar o repositório do GitHub
2. Fazer o build da imagem (Node.js, instala dependências, compila o frontend)
3. Subir o container conectado ao Traefik

O build leva aproximadamente **2 a 5 minutos** na primeira vez.

---

## 5. Verificar se subiu corretamente

No terminal do servidor:

```bash
# Ver se o container está rodando
docker ps | grep interativa

# Ver os logs em tempo real
docker logs -f interativa

# Deve aparecer algo como:
# 🚀 Interativa Server  → http://localhost:3001
```

Acesse no navegador:

```
https://interativa.adrofecha.com.br        → Dashboard de administração
https://interativa.adrofecha.com.br/tv/    → App da TV (abrir no browser da TV)
```

---

## 6. Parear uma TV

1. No browser da TV, acesse `https://interativa.adrofecha.com.br/tv/`
2. Será exibido um código de 6 letras na tela
3. No Dashboard, vá em **Telas → Parear TV**
4. Selecione a tela e clique no código que aparecer

---

## 7. Atualizar o sistema após mudanças no código

No Portainer → **Stacks → interativa → Editor** → clique em **Update the stack**.

O Portainer vai clonar a versão mais recente do GitHub e reconstruir a imagem automaticamente.

Ou via terminal do servidor:

```bash
cd /data/compose/interativa   # pasta onde o Portainer guarda o stack
docker compose pull && docker compose up -d --build
```

---

## 8. Backup dos dados

Os dados ficam nos volumes Docker. Para fazer backup:

```bash
# Backup do banco de dados JSON
docker run --rm \
  -v interativa_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/interativa_data_$(date +%Y%m%d).tar.gz -C /data .

# Backup das mídias (imagens e vídeos)
docker run --rm \
  -v interativa_uploads:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/interativa_uploads_$(date +%Y%m%d).tar.gz -C /data .
```

Para restaurar:

```bash
docker run --rm \
  -v interativa_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/interativa_data_20250101.tar.gz -C /data
```

---

## Resumo de URLs

| URL | Descrição |
|---|---|
| `https://interativa.adrofecha.com.br` | Dashboard (administração) |
| `https://interativa.adrofecha.com.br/tv/` | App da TV |
| `https://interativa.adrofecha.com.br/api/health` | Status do servidor |
| `https://interativa.adrofecha.com.br/uploads/` | Arquivos de mídia |
