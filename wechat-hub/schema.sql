-- ==============================================================================
-- 公众号新人互助互关平台 (WeChat Follow Hub) - Supabase 数据库一键初始化脚本
-- 在 Supabase 后台 -> SQL Editor 中粘贴并点击 Run 即可一键完成建表与权限配置
-- ==============================================================================

-- 1. 创建号主信息数据表
create table if not exists public.wechat_accounts (
  id bigint generated always as identity primary key,
  created_at timestamptz default now() not null,
  name text not null,
  category text not null,
  category_label text not null,
  bio text not null,
  wechat text default '未公开',
  qr_url text not null,
  avatar_letter text default '号',
  avatar_grad text default 'from-brand-500 to-emerald-600',
  followers_count int default 1
);

-- 2. 启用行级安全机制 (Row Level Security, RLS)
alter table public.wechat_accounts enable row level security;

-- 3. 创建公开读取权限：所有人都可以浏览所有号主卡片
create policy "Allow public read"
  on public.wechat_accounts
  for select
  using (true);

-- 4. 创建公开插入权限：任何用户都可以上传自己的公众号
create policy "Allow public insert"
  on public.wechat_accounts
  for insert
  with check (true);

-- 5. 允许所有人增加互助热度 (Update)
create policy "Allow public update followers"
  on public.wechat_accounts
  for update
  using (true);

-- 6. 允许删除卡片 (Delete)
create policy "Allow public delete"
  on public.wechat_accounts
  for delete
  using (true);

-- 7. 创建存储桶 (Storage Bucket) 用于存放二维码图片文件
insert into storage.buckets (id, name, public)
values ('qr-codes', 'qr-codes', true)
on conflict (id) do nothing;

create policy "Public Access to QR Codes"
  on storage.objects for select
  using ( bucket_id = 'qr-codes' );

create policy "Public Upload QR Codes"
  on storage.objects for insert
  with check ( bucket_id = 'qr-codes' );
