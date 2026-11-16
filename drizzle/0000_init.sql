CREATE TABLE "ai_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"source" varchar(10) NOT NULL,
	"model" varchar(120),
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" varchar(40) NOT NULL,
	"entity_id" varchar(40),
	"action" varchar(40) NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_card_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"date" date NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"balance_before" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"bank" varchar(120),
	"outstanding_balance" numeric(14, 2) NOT NULL,
	"credit_limit" numeric(14, 2),
	"interest_rate" numeric(9, 4),
	"rate_period" varchar(10) DEFAULT 'monthly' NOT NULL,
	"minimum_due" numeric(14, 2),
	"billing_day" integer,
	"due_day" integer,
	"late_charges" numeric(14, 2),
	"other_fees" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"status" varchar(10) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_free_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_month" varchar(7) NOT NULL,
	"description" text,
	"baseline_debt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"default_budget" numeric(14, 2) DEFAULT '0' NOT NULL,
	"is_essential" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"date" date NOT NULL,
	"month" varchar(7) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"description" varchar(255),
	"kind" varchar(12) DEFAULT 'one_time' NOT NULL,
	"source" varchar(12) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" varchar(120) DEFAULT 'My Finances' NOT NULL,
	"monthly_salary" numeric(14, 2) DEFAULT '0' NOT NULL,
	"salary_credit_day" integer,
	"current_savings" numeric(14, 2) DEFAULT '0' NOT NULL,
	"emergency_savings_target" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" varchar(7) NOT NULL,
	"salary_received" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_income" numeric(14, 2) DEFAULT '0' NOT NULL,
	"planned_expenses" numeric(14, 2) DEFAULT '0' NOT NULL,
	"actual_expenses" numeric(14, 2) DEFAULT '0' NOT NULL,
	"emi_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"extra_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"card_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"savings_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"opening_debt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"closing_debt" numeric(14, 2) DEFAULT '0' NOT NULL,
	"principal_reduction" numeric(14, 2) DEFAULT '0' NOT NULL,
	"interest_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"planned_payment" numeric(14, 2) DEFAULT '0' NOT NULL,
	"debt_balances" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"projected_debt_free_month" varchar(7),
	"projected_total_interest" numeric(14, 2),
	"notes" text,
	"status" varchar(10) DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"date" date NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"principal_component" numeric(14, 2) DEFAULT '0' NOT NULL,
	"interest_component" numeric(14, 2) DEFAULT '0' NOT NULL,
	"charges_component" numeric(14, 2) DEFAULT '0' NOT NULL,
	"balance_before" numeric(14, 2) NOT NULL,
	"balance_after" numeric(14, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"lender" varchar(120),
	"loan_type" varchar(40) DEFAULT 'personal' NOT NULL,
	"original_principal" numeric(14, 2),
	"outstanding_principal" numeric(14, 2) NOT NULL,
	"interest_rate" numeric(9, 4),
	"rate_period" varchar(10) DEFAULT 'annual' NOT NULL,
	"interest_method" varchar(12) DEFAULT 'reducing' NOT NULL,
	"interest_convention" varchar(12) DEFAULT 'monthly' NOT NULL,
	"emi" numeric(14, 2),
	"remaining_tenure_months" integer,
	"payment_day" integer,
	"start_date" date,
	"prepayment_allowed" boolean DEFAULT true NOT NULL,
	"foreclosure_charge_pct" numeric(9, 4) DEFAULT '0' NOT NULL,
	"additional_monthly_charges" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"status" varchar(10) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"month" varchar(7) NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repayment_plan_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"month_index" integer NOT NULL,
	"month" varchar(7) NOT NULL,
	"debt_key" varchar(40) NOT NULL,
	"debt_name" varchar(120) NOT NULL,
	"opening" numeric(14, 2) NOT NULL,
	"interest" numeric(14, 2) NOT NULL,
	"charges" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment" numeric(14, 2) NOT NULL,
	"principal" numeric(14, 2) NOT NULL,
	"closing" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repayment_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"strategy" varchar(20) NOT NULL,
	"start_month" varchar(7) NOT NULL,
	"monthly_budget" numeric(14, 2) NOT NULL,
	"total_interest" numeric(14, 2) NOT NULL,
	"debt_free_month" varchar(7),
	"months_to_debt_free" integer,
	"is_active" boolean DEFAULT false NOT NULL,
	"inputs" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"strategy" varchar(20) NOT NULL,
	"overrides" jsonb NOT NULL,
	"result_summary" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"priority_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_strategy" varchar(20) DEFAULT 'priority' NOT NULL,
	"planned_monthly_savings" numeric(14, 2) DEFAULT '0' NOT NULL,
	"stop_savings_at_target" boolean DEFAULT true NOT NULL,
	"extra_monthly_repayment" numeric(14, 2) DEFAULT '0' NOT NULL,
	"plan_start_month" varchar(7),
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"ai_consent" boolean DEFAULT false NOT NULL,
	"ai_consent_at" timestamp with time zone,
	"ai_model" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "credit_card_transactions" ADD CONSTRAINT "credit_card_transactions_card_id_credit_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."credit_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_transactions" ADD CONSTRAINT "expense_transactions_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_profile_id_financial_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."financial_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_transactions" ADD CONSTRAINT "loan_transactions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repayment_plan_items" ADD CONSTRAINT "repayment_plan_items_plan_id_repayment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."repayment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_rec_created_idx" ON "ai_recommendations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "card_tx_card_idx" ON "credit_card_transactions" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_name_uq" ON "expense_categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "expense_tx_month_idx" ON "expense_transactions" USING btree ("month");--> statement-breakpoint
CREATE INDEX "expense_tx_category_idx" ON "expense_transactions" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_month_uq" ON "financial_snapshots" USING btree ("month");--> statement-breakpoint
CREATE INDEX "income_sources_profile_idx" ON "income_sources" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "loan_tx_loan_idx" ON "loan_transactions" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "loan_tx_date_idx" ON "loan_transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "loans_status_idx" ON "loans" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_budgets_cat_month_uq" ON "monthly_budgets" USING btree ("category_id","month");--> statement-breakpoint
CREATE INDEX "monthly_budgets_month_idx" ON "monthly_budgets" USING btree ("month");--> statement-breakpoint
CREATE INDEX "plan_items_plan_idx" ON "repayment_plan_items" USING btree ("plan_id","month_index");--> statement-breakpoint
CREATE INDEX "repayment_plans_created_idx" ON "repayment_plans" USING btree ("created_at");