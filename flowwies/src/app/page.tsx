"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/api";
import {
  Calendar,
  DollarSign,
  FileText,
  Shield,
  Award,
  Users,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  LogOut,
  User,
  Heart,
  Eye,
  EyeOff,
  Sparkles,
  UserPlus,
  Plus,
  Search,
  Filter,
  X,
  Lock,
  AlertCircle,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Briefcase,
  Building,
  CreditCard,
  Pencil,
} from "lucide-react";

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role_level: number;
  hrms_role: "employee" | "manager";
  role?: "employee" | "manager";
  department: string;
  secondary_department?: string;
  departments?: string[];
  can_access_crm: boolean;
  is_growth: boolean;
  is_admin: boolean;
  is_manager: boolean;

  manager_id?: string;
  avatar_color?: string;
  emp_code?: string;
  dob?: string;
  date_joined?: string;
  created_at?: string;
  phone?: string;
  personal_email?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  bank_account_holder?: string;
  bank_name?: string;
  bank_account_number?: string;
  ifsc_code?: string;
  upi_id?: string;
  is_active?: boolean;
  must_change_password?: boolean;
}

interface LeaveBalance {
  casual_days?: number;
  sick_days?: number;
  earned_days?: number;
  monthly_quota?: number;
  used_this_month?: number;
  remaining_this_month?: number;
}

interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  status: "pending" | "approved" | "declined";
  is_birthday?: boolean;
  profiles?: {
    full_name: string;
    avatar_color?: string;
    department?: string;
  };
}

interface Claim {
  id: string;
  user_id: string;
  title: string;
  amount: number;
  claim_date: string;
  receipt_file_name?: string;
  receipt_storage_path?: string;
  is_image?: boolean;
  status: "pending" | "approved" | "declined" | "paid";
  profiles?: {
    full_name: string;
    department?: string;
    bank_name?: string;
    bank_account_number?: string;
    upi_id?: string;
  };
}

interface Payslip {
  id: string;
  user_id: string;
  month_year: string;
  pay_period_date: string;
  net_amount: number;
  pdf_storage_path?: string;
  published_at?: string;
  profiles?: {
    full_name: string;
    department?: string;
  };
}

interface InsuranceCover {
  id: string;
  user_id: string;
  policy_number: string;
  cover_amount: string;
  dependents: string;
  ecard_storage_path?: string;
}

interface Policy {
  id: string;
  title: string;
  punchline: string;
  body: string;
  sort_order: number;
}

interface Talent {
  id: string;
  user_id: string;
  month_year: string;
  why_text: string;
  cheers_count: number;
  profiles?: {
    full_name: string;
    department: string;
    avatar_color?: string;
  };
}

interface Nomination {
  id: string;
  why_text: string;
  nominee?: {
    id: string;
    full_name: string;
    department: string;
  };
  nominator?: {
    full_name: string;
  };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEPARTMENTS = ["Growth", "Tech"];

const parseMonthYearSortKey = (monthYearStr?: string) => {
  if (!monthYearStr) return 999999;
  const parts = monthYearStr.trim().split(/\s+/);
  if (parts.length >= 2) {
    const monthPrefix = parts[0].toLowerCase().slice(0, 3);
    const year = parseInt(parts[1], 10) || 9999;
    const mIdx = MONTHS.findIndex((m) => m.toLowerCase().startsWith(monthPrefix));
    if (mIdx !== -1) {
      return year * 100 + mIdx;
    }
  }
  return 999999;
};


export default function FlowwiesApp() {
  // Session & user state
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  // Login form state
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Force change password on first login states
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [isChangingPwd, setIsChangingPwd] = useState(false);
  const [changePwdError, setChangePwdError] = useState("");

  // Active view tab: 'home' | 'reimbursements' | 'profile' | 'access'
  const [activeTab, setActiveTab] = useState<"home" | "reimbursements" | "profile" | "access">("home");

  // People & Access Management States
  const [showAddPersonModal, setShowAddPersonModal] = useState(false);
  const [addPersonForm, setAddPersonForm] = useState({
    full_name: "",
    email: "",
    role: "employee", // 'employee' | 'manager'
    departments: ["Tech"] as string[],
    manager_id: "",
    dob: "", // Date of birth for automatic Birthday Leave
    casual_days: 2,
    sick_days: 0,
    earned_days: 0,
  });
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleDeptFilter, setPeopleDeptFilter] = useState<"all" | "Growth" | "Tech">("all");
  const [peopleRoleFilter, setPeopleRoleFilter] = useState<"all" | "manager" | "employee">("all");

  // Rotating quotes
  const quotes = [
    "Your leave isn't an if. It's a when.",
    "Payslip? Not if. When the 1st arrives.",
    "Approval? Not if. Before lunch.",
    "Refund? Not if. When the bill is uploaded."
  ];
  const [quoteIdx, setQuoteIdx] = useState(0);

  // Leave module states (2 leaves per month, renews every month)
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance>({
    casual_days: 2,
    sick_days: 0,
    earned_days: 0,
    monthly_quota: 2.0,
    used_this_month: 0,
    remaining_this_month: 2.0,
  });
  const [pendingLeaveCount, setPendingLeaveCount] = useState<number>(0);
  const [nextHoliday, setNextHoliday] = useState<any>(null);
  const [myLeaves, setMyLeaves] = useState<LeaveRequest[]>([]);
  const [leaveApprovals, setLeaveApprovals] = useState<LeaveRequest[]>([]);
  const [calendarLeaves, setCalendarLeaves] = useState<LeaveRequest[]>([]);
  const [calHolidays, setCalHolidays] = useState<any[]>([]);
  const [calMonth, setCalMonth] = useState<number>(new Date().getMonth());
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear());

  // Holiday calendar management states (Manager only)
  const [showAddHolidayModal, setShowAddHolidayModal] = useState(false);
  const [showUploadHolidayModal, setShowUploadHolidayModal] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [bulkHolidayText, setBulkHolidayText] = useState("");
  const [isUploadingHolidays, setIsUploadingHolidays] = useState(false);

  // Leave apply form
  const [applyType, setApplyType] = useState<string>("Monthly");
  const [applyStart, setApplyStart] = useState("");
  const [applyEnd, setApplyEnd] = useState("");
  const [applyReason, setApplyReason] = useState("");

  // Reimbursements states
  const [myClaims, setMyClaims] = useState<Claim[]>([]);
  const [claimApprovals, setClaimApprovals] = useState<Claim[]>([]);
  const [newClaimTitle, setNewClaimTitle] = useState("");
  const [newClaimAmount, setNewClaimAmount] = useState("");
  const [newClaimFileName, setNewClaimFileName] = useState("");

  // Pay & cover states
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [selectedPayMemberId, setSelectedPayMemberId] = useState<string>("");
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [insurance, setInsurance] = useState<InsuranceCover | null>(null);

  // Policies states
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [editPolicyBody, setEditPolicyBody] = useState("");
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [newRuleTitle, setNewRuleTitle] = useState("");
  const [newRulePunchline, setNewRulePunchline] = useState("");
  const [newRuleBody, setNewRuleBody] = useState("");
  const [ruleUploading, setRuleUploading] = useState(false);

  // Talent & Wall states
  const [talent, setTalent] = useState<Talent | null>(null);
  const [allTalents, setAllTalents] = useState<any[]>([]);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [wall, setWall] = useState<any[]>([]);
  const [nomineeId, setNomineeId] = useState("");
  const [nominateWhy, setNominateWhy] = useState("");
  const [talentMonth, setTalentMonth] = useState<number>(new Date().getMonth());
  const [talentYear, setTalentYear] = useState<number>(new Date().getFullYear());

  // Profile edit states
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [profileForm, setProfileForm] = useState<any>({});
  const [showAccNo, setShowAccNo] = useState(false);
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const isProfileDirtyRef = React.useRef(false);

  const handleProfileFieldChange = (field: string, value: any) => {
    setIsProfileDirty(true);
    isProfileDirtyRef.current = true;
    setProfileForm((prev: any) => ({ ...prev, [field]: value }));
  };

  // View & Edit team member details modal (for managers)
  const [viewingMember, setViewingMember] = useState<Profile | null>(null);
  const [showViewingAccNo, setShowViewingAccNo] = useState(false);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [memberEditForm, setMemberEditForm] = useState<any>({});
  const [memberEditSaving, setMemberEditSaving] = useState(false);
  const [memberEditError, setMemberEditError] = useState("");
  const [memberEditSuccess, setMemberEditSuccess] = useState("");

  const openMemberModal = (m: Profile, editImmediately = false) => {
    setViewingMember(m);
    setIsEditingMember(editImmediately);
    setShowViewingAccNo(false);
    setMemberEditError("");
    setMemberEditSuccess("");
    setMemberEditForm({
      full_name: m.full_name || "",
      email: m.email || "",
      emp_code: m.emp_code || "",
      role: m.role || m.hrms_role || "employee",
      hrms_role: m.role || m.hrms_role || "employee",
      departments: (m.departments && m.departments.length > 0) ? m.departments : [m.department || "Tech"],
      manager_id: m.manager_id || "",
      can_access_crm: Boolean(m.can_access_crm),
      is_active: m.is_active !== false,
      phone: m.phone || "",
      personal_email: m.personal_email || "",
      dob: m.dob || "",
      date_joined: m.date_joined || "",
      emergency_contact_name: m.emergency_contact_name || "",
      emergency_contact_phone: m.emergency_contact_phone || "",
      address: m.address || "",
      city: m.city || "",
      state: m.state || "",
      pin_code: m.pin_code || "",
      bank_account_holder: m.bank_account_holder || "",
      bank_name: m.bank_name || "",
      bank_account_number: m.bank_account_number || "",
      ifsc_code: m.ifsc_code || "",
      upi_id: m.upi_id || "",
    });
  };

  // Profile password change states
  const [profileNewPwd, setProfileNewPwd] = useState("");
  const [profileConfirmPwd, setProfileConfirmPwd] = useState("");
  const [showProfileNewPwd, setShowProfileNewPwd] = useState(false);
  const [showProfileConfirmPwd, setShowProfileConfirmPwd] = useState(false);
  const [profilePwdLoading, setProfilePwdLoading] = useState(false);
  const [profilePwdError, setProfilePwdError] = useState("");
  const [profilePwdSuccess, setProfilePwdSuccess] = useState("");

  // Filtered team members for People & access view
  const filteredTeamMembers = useMemo(() => {
    return teamMembers.filter((m) => {
      const q = peopleSearch.trim().toLowerCase();
      if (q) {
        const matchesName = m.full_name?.toLowerCase().includes(q);
        const matchesEmail = m.email?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      if (peopleDeptFilter !== "all") {
        const depts = (m.departments && m.departments.length > 0) ? m.departments : [m.department || "Tech"];
        if (!depts.includes(peopleDeptFilter)) return false;
      }
      if (peopleRoleFilter !== "all") {
        const r = (m.role || m.hrms_role || "employee").toLowerCase();
        if (r !== peopleRoleFilter) return false;
      }
      return true;
    });
  }, [teamMembers, peopleSearch, peopleDeptFilter, peopleRoleFilter]);

  // Toast
  const [toastMessage, setToastMessage] = useState<string>("");
  const [showToast, setShowToast] = useState(false);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Rotating header tagline
  useEffect(() => {
    const t = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % quotes.length);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  // Fetch real Supabase session on load
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setSession(data.session);
          setToken(data.session.access_token);
          await loadUserProfile(data.session.access_token);
        }
      } catch (e) {
        console.error("Auth session check error", e);
      } finally {
        setLoading(false);
      }
    };
    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, sess) => {
      setSession(sess);
      if (sess) {
        setToken(sess.access_token);
        // Only trigger initial profile load on SIGNED_IN event to prevent overwriting active edits
        if (event === "SIGNED_IN") {
          await loadUserProfile(sess.access_token);
        }
      } else {
        setProfile(null);
        setToken("");
        setIsProfileDirty(false);
        isProfileDirtyRef.current = false;
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Warn user on page refresh or tab close if there are unsaved profile changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProfileDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes in your profile. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Real Supabase Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    try {
      const cleanEmail = emailInput.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: passwordInput,
      });

      if (error) {
        if (error.message.toLowerCase().includes("email not confirmed")) {
          setLoginError("This email is not confirmed in Supabase yet. Please run migration 008 in Supabase SQL editor to auto-confirm all users.");
        } else if (error.message.toLowerCase().includes("invalid login credentials")) {
          setLoginError("Invalid password or email. If you want to reset password to workfloww@2026, run migration 008 in Supabase SQL editor.");
        } else {
          setLoginError(error.message);
        }
        return;
      }

      if (data.session) {
        setSession(data.session);
        setToken(data.session.access_token);
        await loadUserProfile(data.session.access_token, true);
        showNotification("Welcome back!");
      }
    } catch (err: any) {
      setLoginError(err.message || "Failed to sign in.");
    } finally {
      setLoginLoading(false);
    }
  };

  // Load user profile from public.profiles
  const loadUserProfile = async (jwt: string, forceReset = false) => {
    try {
      const res = await fetch(`${API_URL}/hrms/me`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const p: Profile = await res.json();
        setProfile(p);
        setSelectedProfileId(p.id);
        setSelectedPayMemberId(p.id);
        setProfileForm((prev: any) => {
          // If user has unsaved changes and not forced, keep their typed edits
          if (!forceReset && isProfileDirtyRef.current) {
            return prev;
          }
          return { ...p };
        });
        await fetchAllData(jwt, p.id, p);
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification(err.detail || "Could not load profile from database.");
      }
    } catch (err) {
      console.error("Error loading profile", err);
      showNotification("Could not reach backend API at " + API_URL);
    }
  };

  // Handle mandatory password change on first login
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePwdError("");

    if (newPasswordInput.length < 6) {
      setChangePwdError("Password must be at least 6 characters long.");
      return;
    }
    if (newPasswordInput === "workfloww@2026") {
      setChangePwdError("You cannot reuse the default temporary password. Please choose a new, unique password.");
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setChangePwdError("Passwords do not match. Please verify and re-enter.");
      return;
    }

    setIsChangingPwd(true);
    try {
      // 1. Update password in Supabase Auth
      const { error: authErr } = await supabase.auth.updateUser({
        password: newPasswordInput,
      });
      if (authErr) {
        throw new Error(authErr.message || "Failed to update password in authentication system.");
      }

      // 2. Clear must_change_password flag in database
      try {
        await fetch(`${API_URL}/hrms/me/change-password`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (beErr) {
        console.warn("Backend change-password notification notice:", beErr);
      }

      // 3. Fallback direct update to profiles table via supabase
      try {
        if (profile?.id) {
          await supabase
            .from("profiles")
            .update({ must_change_password: false })
            .eq("id", profile.id);
        }
      } catch (sbErr) {
        console.warn("Direct profiles update notice:", sbErr);
      }

      // 4. Update local state
      setProfile((prev) => (prev ? { ...prev, must_change_password: false } : null));
      showNotification("Password updated successfully! Welcome to Flowwies.");
      setNewPasswordInput("");
      setConfirmPasswordInput("");
    } catch (err: any) {
      setChangePwdError(err.message || "Could not update password.");
    } finally {
      setIsChangingPwd(false);
    }
  };

  // Fetch all data from live database tables
  const fetchAllData = async (jwt: string, currentUserId: string, currentProfile: Profile) => {
    const headers = { Authorization: `Bearer ${jwt}` };

    // 1. Leave Summary (from public.leave_balances & leave_requests)
    fetch(`${API_URL}/hrms/leave/summary`, { headers })
      .then((r) => r.json())
      .then((d) => {
        const remaining = d.remaining_this_month !== undefined
          ? d.remaining_this_month
          : (d.balance?.remaining_this_month !== undefined ? d.balance.remaining_this_month : d.balance?.casual_days);
        const used = d.used_this_month !== undefined
          ? d.used_this_month
          : (d.taken_this_month !== undefined ? d.taken_this_month : (d.balance?.used_this_month !== undefined ? d.balance.used_this_month : 0));
        const quota = d.monthly_allowance ?? d.balance?.monthly_quota ?? 2.0;

        setLeaveBalance({
          casual_days: Number(remaining ?? 2),
          remaining_this_month: Number(remaining ?? 2),
          used_this_month: Number(used ?? 0),
          monthly_quota: Number(quota ?? 2),
        });
        setPendingLeaveCount(d.pending_count || 0);
        setNextHoliday(d.next_holiday);
      })
      .catch(console.error);

    // 2. Calendar data (from public.leave_requests & public.company_holidays)
    loadCalendar(jwt, calMonth, calYear);

    // 3. User leave requests (from public.leave_requests)
    fetch(`${API_URL}/hrms/leave/requests`, { headers })
      .then((r) => r.json())
      .then((d) => setMyLeaves(Array.isArray(d) ? d : []))
      .catch(console.error);

    // 4. Pending Leave approvals (from public.leave_requests for manager / admin)
    if (currentProfile.is_manager || currentProfile.is_admin) {
      fetch(`${API_URL}/hrms/leave/approvals`, { headers })
        .then((r) => r.json())
        .then((d) => setLeaveApprovals(Array.isArray(d) ? d : []))
        .catch(console.error);
    }

    // 5. Reimbursements (from public.reimbursement_claims)
    fetch(`${API_URL}/hrms/reimbursements`, { headers })
      .then((r) => r.json())
      .then((d) => setMyClaims(Array.isArray(d) ? d : []))
      .catch(console.error);

    // 6. Reimbursement Approvals
    if (currentProfile.is_manager || currentProfile.is_admin) {
      fetch(`${API_URL}/hrms/reimbursements/approvals`, { headers })
        .then((r) => r.json())
        .then((d) => setClaimApprovals(Array.isArray(d) ? d : []))
        .catch(console.error);
    }

    // 7. Team members (from public.profiles)
    fetch(`${API_URL}/hrms/team`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setTeamMembers(d);
          const firstOther = d.find((u) => u.id !== currentUserId);
          if (firstOther) setNomineeId(firstOther.id);
        }
      })
      .catch(console.error);

    // 8. Policies (from public.company_policies)
    fetch(`${API_URL}/hrms/policies`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setPolicies(d);
      })
      .catch(console.error);

    // 9. Talent & Hall of Flex (from public.talent_of_the_month & public.talent_nominations)
    fetch(`${API_URL}/hrms/talent`, { headers })
      .then((r) => r.json())
      .then((d) => {
        setTalent(d.current || null);
        setNominations(Array.isArray(d.nominations) ? d.nominations : []);
        setWall(Array.isArray(d.wall) ? d.wall : []);
        const list = Array.isArray(d.all_crowned) ? d.all_crowned : [d.current, ...(d.wall || [])].filter(Boolean);
        setAllTalents(list);
      })
      .catch(console.error);

    // 10. Payslips (from public.payslips)
    loadPayslips(jwt, currentUserId);

    // 11. Insurance (from public.insurance_cover)
    loadInsurance(jwt, currentUserId);
  };

  const loadPayslips = (jwt: string, targetUserId: string) => {
    fetch(`${API_URL}/hrms/payslips?user_id=${targetUserId}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })
      .then((r) => r.json())
      .then((d) => setPayslips(Array.isArray(d) ? d : []))
      .catch(console.error);
  };

  const loadInsurance = (jwt: string, targetUserId: string) => {
    fetch(`${API_URL}/hrms/insurance?user_id=${targetUserId}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })
      .then((r) => r.json())
      .then((d) => setInsurance(d || null))
      .catch(console.error);
  };

  const loadCalendar = (jwt: string, m: number, y: number) => {
    const startStr = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const endStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    fetch(`${API_URL}/hrms/leave/calendar?start_date=${startStr}&end_date=${endStr}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })
      .then((r) => r.json())
      .then((d) => {
        setCalendarLeaves(d.leaves || []);
        setCalHolidays(d.holidays || []);
      })
      .catch(console.error);
  };

  const getInitials = (name?: string) => {
    if (!name) return "FW";
    return name
      .split(" ")
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("");
  };

  // Leave Actions
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyStart) {
      showNotification("Please select a start date.");
      return;
    }
    const end = applyEnd || applyStart;
    try {
      const res = await fetch(`${API_URL}/hrms/leave/request`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leave_type: applyType,
          start_date: applyStart,
          end_date: end,
          reason: applyReason || "Personal errands",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.detail || "Could not apply for leave.");
        return;
      }
      showNotification("Leave request sent to your approver!");
      setApplyStart("");
      setApplyEnd("");
      setApplyReason("");
      if (profile) fetchAllData(token, profile.id, profile);
    } catch (err) {
      showNotification("Error applying for leave.");
    }
  };

  const handleLeaveDecision = async (reqId: string, status: "approved" | "declined") => {
    try {
      const res = await fetch(`${API_URL}/hrms/leave/${reqId}/decision`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showNotification(`Leave request ${status}.`);
        if (profile) fetchAllData(token, profile.id, profile);
      }
    } catch (e) {
      showNotification("Failed to update leave decision.");
    }
  };

  const handleWithdrawLeave = async (reqId: string) => {
    try {
      const res = await fetch(`${API_URL}/hrms/leave/${reqId}/withdraw`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showNotification("Leave request withdrawn.");
        if (profile) fetchAllData(token, profile.id, profile);
      }
    } catch (e) {
      showNotification("Failed to withdraw leave.");
    }
  };

  // Holiday Calendar Actions (Manager Only)
  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayName.trim() || !newHolidayDate) {
      showNotification("Please provide holiday name and date.");
      return;
    }
    const year = parseInt(newHolidayDate.split("-")[0]) || calYear;
    try {
      const res = await fetch(`${API_URL}/hrms/holidays`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newHolidayName.trim(),
          holiday_date: newHolidayDate,
          year,
        }),
      });
      if (res.ok) {
        showNotification("Holiday added to company calendar!");
        setShowAddHolidayModal(false);
        setNewHolidayName("");
        setNewHolidayDate("");
        loadCalendar(token, calMonth, calYear);
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification(err.detail || "Failed to add holiday.");
      }
    } catch (e) {
      showNotification("Error adding holiday.");
    }
  };

  const handleBulkUploadHolidays = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkHolidayText.trim()) {
      showNotification("Please provide holidays in CSV or text format.");
      return;
    }
    // Parse lines: YYYY-MM-DD, Holiday Name
    const lines = bulkHolidayText.split("\n");
    const holidaysToUpload: { name: string; holiday_date: string; year: number }[] = [];
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.toLowerCase().startsWith("date")) continue;
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length >= 2) {
        const d = parts[0];
        const name = parts.slice(1).join(", ");
        const yr = parseInt(d.split("-")[0]) || calYear;
        if (d.match(/^\d{4}-\d{2}-\d{2}$/)) {
          holidaysToUpload.push({ holiday_date: d, name, year: yr });
        }
      }
    }

    if (holidaysToUpload.length === 0) {
      showNotification("Could not parse any valid entries. Use format: YYYY-MM-DD, Holiday Name");
      return;
    }

    setIsUploadingHolidays(true);
    try {
      const res = await fetch(`${API_URL}/hrms/holidays/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ holidays: holidaysToUpload }),
      });
      if (res.ok) {
        showNotification(`Successfully uploaded ${holidaysToUpload.length} holidays!`);
        setShowUploadHolidayModal(false);
        setBulkHolidayText("");
        loadCalendar(token, calMonth, calYear);
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification(err.detail || "Failed to upload holidays.");
      }
    } catch (e) {
      showNotification("Error uploading holidays.");
    } finally {
      setIsUploadingHolidays(false);
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    if (!confirm("Are you sure you want to remove this holiday?")) return;
    try {
      const res = await fetch(`${API_URL}/hrms/holidays/${holidayId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showNotification("Holiday removed from calendar.");
        loadCalendar(token, calMonth, calYear);
      } else {
        showNotification("Failed to delete holiday.");
      }
    } catch (e) {
      showNotification("Error deleting holiday.");
    }
  };

  // Reimbursements Actions
  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClaimTitle.trim()) {
      showNotification("Give your claim a title.");
      return;
    }
    const amt = parseFloat(newClaimAmount);
    if (!amt || amt <= 0) {
      showNotification("Enter a valid amount spent.");
      return;
    }
    if (!newClaimFileName) {
      showNotification("Please attach the receipt filename.");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/hrms/reimbursements`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: newClaimTitle,
          amount: amt,
          receipt_file_name: newClaimFileName,
          is_image: /\.(jpg|jpeg|png|webp)$/i.test(newClaimFileName),
        }),
      });
      if (res.ok) {
        showNotification("Expense claim submitted to approver.");
        setNewClaimTitle("");
        setNewClaimAmount("");
        setNewClaimFileName("");
        if (profile) fetchAllData(token, profile.id, profile);
      }
    } catch (err) {
      showNotification("Failed to submit claim.");
    }
  };

  const handleClaimDecision = async (claimId: string, status: "approved" | "declined") => {
    try {
      const res = await fetch(`${API_URL}/hrms/reimbursements/${claimId}/decision`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showNotification(`Claim ${status}.`);
        if (profile) fetchAllData(token, profile.id, profile);
      }
    } catch (e) {
      showNotification("Failed to update claim decision.");
    }
  };

  const handlePayClaim = async (claimId: string) => {
    try {
      const res = await fetch(`${API_URL}/hrms/reimbursements/${claimId}/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showNotification("Claim marked as paid!");
        if (profile) fetchAllData(token, profile.id, profile);
      }
    } catch (e) {
      showNotification("Failed to mark claim as paid.");
    }
  };

  // Talent & Wall Actions
  const handleCheer = async (targetId?: string) => {
    const idToCheer = targetId || talent?.id;
    if (!idToCheer) return;
    try {
      const res = await fetch(`${API_URL}/hrms/talent/${idToCheer}/cheer`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTalent((prev) => (prev && prev.id === idToCheer ? { ...prev, cheers_count: (prev.cheers_count || 0) + 1 } : prev));
        setAllTalents((prev) =>
          prev.map((t) => (t.id === idToCheer ? { ...t, cheers_count: (t.cheers_count || 0) + 1 } : t))
        );
        showNotification(`Cheer sent! 👏`);
      }
    } catch (e) {
      showNotification("Could not cheer right now.");
    }
  };

  const handlePublishTalent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.is_manager && !profile?.is_admin) {
      showNotification("Only managers can publish Talent of the Month.");
      return;
    }
    if (!nomineeId) {
      showNotification("Pick someone to crown as Talent of the Month.");
      return;
    }
    if (!nominateWhy.trim()) {
      showNotification("Add a citation or reason for crowning them.");
      return;
    }
    const selectedMonthYear = `${MONTHS[talentMonth]} ${talentYear}`;
    const targetMember = teamMembers.find((m) => m.id === nomineeId);
    try {
      const res = await fetch(`${API_URL}/hrms/talent/crown`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: nomineeId,
          month_year: selectedMonthYear,
          why_text: nominateWhy.trim(),
          nomination_id: null,
        }),
      });
      if (res.ok) {
        showNotification(`👑 ${targetMember?.full_name || "Winner"} published as Talent of the Month for ${selectedMonthYear}!`);
        setNominateWhy("");
        if (profile) fetchAllData(token, profile.id, profile);
      } else {
        const data = await res.json().catch(() => ({}));
        showNotification(data.detail || "Could not publish Talent of the Month.");
      }
    } catch (e) {
      showNotification("Could not publish Talent of the Month.");
    }
  };

  const handleDeleteTalent = async (talentId: string, name?: string, monthYear?: string) => {
    if (!profile?.is_manager) {
      showNotification("Only managers can delete talent records.");
      return;
    }
    const label = name ? `${name}${monthYear ? ` (${monthYear})` : ""}` : "this record";
    if (!window.confirm(`Are you sure you want to remove ${label} from Hall of Flex?`)) {
      return;
    }
    try {
      const res = await fetch(`${API_URL}/hrms/talent/${talentId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        showNotification(`Removed ${label}.`);
        if (profile) fetchAllData(token, profile.id, profile);
      } else {
        const data = await res.json().catch(() => ({}));
        showNotification(data.detail || "Could not delete record.");
      }
    } catch (e) {
      showNotification("Could not delete record.");
    }
  };

  // Policy Edit
  const handleSavePolicy = async (policyId: string) => {
    try {
      const res = await fetch(`${API_URL}/hrms/policies/${policyId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: editPolicyBody }),
      });
      if (res.ok) {
        showNotification("Policy updated.");
        setEditingPolicyId(null);
        if (profile) fetchAllData(token, profile.id, profile);
      }
    } catch (e) {
      showNotification("Failed to save policy.");
    }
  };

  // Add/Upload new Policy/Rule (Manager only)
  const handleAddPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleTitle.trim()) {
      showNotification("Please enter a rule title.");
      return;
    }
    if (!newRuleBody.trim()) {
      showNotification("Please enter the rule text.");
      return;
    }

    setRuleUploading(true);
    try {
      const res = await fetch(`${API_URL}/hrms/policies`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: newRuleTitle.trim(),
          punchline: newRulePunchline.trim() || newRuleTitle.trim(),
          body: newRuleBody.trim(),
          sort_order: policies.length + 1,
        }),
      });

      if (res.ok) {
        showNotification("Rule uploaded and published successfully!");
        setNewRuleTitle("");
        setNewRulePunchline("");
        setNewRuleBody("");
        setShowAddRuleModal(false);
        if (profile) fetchAllData(token, profile.id, profile);
      } else {
        const data = await res.json().catch(() => ({}));
        showNotification(data.detail || "Failed to publish rule.");
      }
    } catch (e) {
      showNotification("Failed to upload rule.");
    } finally {
      setRuleUploading(false);
    }
  };

  // Delete Policy (Manager only)
  const handleDeletePolicy = async (policyId: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    try {
      const res = await fetch(`${API_URL}/hrms/policies/${policyId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        showNotification("Rule removed.");
        if (profile) fetchAllData(token, profile.id, profile);
      }
    } catch (e) {
      showNotification("Failed to delete rule.");
    }
  };

  // People & Access (Manager only)
  const handleUpdateMemberAdmin = async (memberId: string, updates: any) => {
    // 1. Optimistic state update for instant responsive UI
    const prevTeam = [...teamMembers];
    setTeamMembers((prev) =>
      prev.map((m) => {
        if (m.id !== memberId) return m;
        const copy: any = { ...m, ...updates };
        if (updates.departments) {
          copy.departments = updates.departments;
          copy.department = updates.departments[0] || "Tech";
          copy.secondary_department = updates.departments[1] || undefined;
          const hasGrowth = updates.departments.some((d: string) => d.toLowerCase() === "growth");
          copy.can_access_crm = hasGrowth || (copy.role === "manager");
        }
        if (updates.role) {
          copy.role = updates.role;
          copy.hrms_role = updates.role;
          if (updates.role === "manager") copy.can_access_crm = true;
        }
        if (updates.can_access_crm !== undefined) {
          copy.can_access_crm = updates.can_access_crm;
        }
        if (updates.is_active !== undefined) {
          copy.is_active = updates.is_active;
        }
        return copy;
      })
    );

    try {
      const res = await fetch(`${API_URL}/hrms/team/${memberId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        showNotification("Team member updated.");
        if (profile) fetchAllData(token, profile.id, profile);
      } else {
        const errData = await res.json().catch(() => ({}));
        showNotification(errData.detail || "Update failed. Please execute migration 007.");
        setTeamMembers(prevTeam);
      }
    } catch (e: any) {
      showNotification(e.message || "Failed to update team member.");
      setTeamMembers(prevTeam);
    }
  };

  // Add Person / Team Member (Manager only)
  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addPersonForm.full_name.trim() || !addPersonForm.email.trim()) {
      showNotification("Please provide both name and work email.");
      return;
    }
    if (addPersonForm.departments.length === 0) {
      showNotification("Please select at least one department (Growth or Tech).");
      return;
    }

    setIsAddingPerson(true);
    try {
      const res = await fetch(`${API_URL}/hrms/team`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(addPersonForm),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to add person.");
      }

      // Also ensure user is registered in Supabase Auth with default password
      try {
        await supabase.auth.signUp({
          email: addPersonForm.email.trim().toLowerCase(),
          password: "workfloww@2026",
          options: {
            data: { full_name: addPersonForm.full_name.trim() }
          }
        });
      } catch (authErr) {
        console.warn("Client auth sign_up notice:", authErr);
      }

      showNotification(data.message || "Team member added successfully!");
      setShowAddPersonModal(false);
      setAddPersonForm({
        full_name: "",
        email: "",
        role: "employee",
        departments: ["Tech"],
        manager_id: "",
        dob: "",
        casual_days: 2,
        sick_days: 0,
        earned_days: 0,
      });

      if (profile) fetchAllData(token, profile.id, profile);
    } catch (err: any) {
      showNotification(err.message || "Error adding team member.");
    } finally {
      setIsAddingPerson(false);
    }
  };

  // Render People & Access (Strictly Manager Only)
  const renderPeopleAndAccess = (isStandalone = false) => {
    if (!profile?.is_manager) return null;

    const growthCount = teamMembers.filter((m) =>
      (m.departments && m.departments.length > 0)
        ? m.departments.includes("Growth")
        : m.department === "Growth"
    ).length;
    const techCount = teamMembers.filter((m) =>
      (m.departments && m.departments.length > 0)
        ? m.departments.includes("Tech")
        : m.department === "Tech"
    ).length;
    const mgrCount = teamMembers.filter((m) => (m.role === "manager" || m.hrms_role === "manager")).length;

    return (
      <section id="sec-access" className={isStandalone ? "pt-2" : "pt-8"}>
        {/* Header & Add Person CTA */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">People &amp; access</h2>
              <span className="bg-[var(--vt2)] text-[var(--ink)] text-xs font-bold px-2.5 py-0.5 rounded-full border border-[var(--ink)] shadow-[1px_1px_0_var(--hard)]">
                Manager View
              </span>
            </div>
            <p className="text-[var(--muted)] text-sm mt-1">
              Strictly restricted to managers. Exactly two roles (Manager, Employee) and two departments (Growth, Tech) with multi-department support.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddPersonModal(true)}
            className="flow-btn pri flex items-center justify-center gap-2 self-start md:self-auto shadow-[4px_4px_0_var(--hard)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Add Person
          </button>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="flow-card p-4 bg-white">
            <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider block">Total Members</span>
            <div className="text-3xl font-extrabold mt-1">{teamMembers.length}</div>
          </div>
          <div className="flow-card p-4 bg-[var(--vt2)]/30 border border-[var(--ink)]">
            <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider block">Growth Team</span>
            <div className="text-3xl font-extrabold text-[var(--ink)] mt-1">{growthCount}</div>
          </div>
          <div className="flow-card p-4 bg-[var(--bt)]/30 border border-[var(--ink)]">
            <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider block">Tech Team</span>
            <div className="text-3xl font-extrabold text-[var(--ink)] mt-1">{techCount}</div>
          </div>
          <div className="flow-card p-4 bg-white">
            <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider block">Managers</span>
            <div className="text-3xl font-extrabold mt-1">{mgrCount}</div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flow-card mb-6 p-4 bg-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none z-10" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={peopleSearch}
                onChange={(e) => setPeopleSearch(e.target.value)}
                className="flow-field w-full text-xs"
                style={{ paddingLeft: "2.5rem", paddingRight: peopleSearch ? "2rem" : "0.75rem" }}
              />
              {peopleSearch && (
                <button
                  type="button"
                  onClick={() => setPeopleSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--vs)] text-[var(--muted)] hover:text-[var(--ink)]"
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Department Filter */}
              <div className="flex items-center gap-1 bg-[var(--vs)] p-1 rounded-xl border border-[var(--line)] text-xs">
                <span className="text-[11px] font-bold text-[var(--muted)] px-2">Dept:</span>
                {(["all", "Growth", "Tech"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPeopleDeptFilter(d)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                      peopleDeptFilter === d
                        ? "bg-white text-[var(--ink)] shadow-[1px_1px_0_var(--hard)] border border-[var(--ink)]"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {d === "all" ? "All" : d}
                  </button>
                ))}
              </div>

              {/* Role Filter */}
              <div className="flex items-center gap-1 bg-[var(--vs)] p-1 rounded-xl border border-[var(--line)] text-xs">
                <span className="text-[11px] font-bold text-[var(--muted)] px-2">Role:</span>
                {(["all", "manager", "employee"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPeopleRoleFilter(r)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all capitalize ${
                      peopleRoleFilter === r
                        ? "bg-white text-[var(--ink)] shadow-[1px_1px_0_var(--hard)] border border-[var(--ink)]"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Members Table */}
        <div className="flow-card overflow-x-auto bg-white">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--line)]">
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Department (Multi-Select)</th>
                <th className="py-2.5 px-3">CRM Access</th>
                <th className="py-2.5 px-3">Reports To</th>
                <th className="py-2.5 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeamMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--muted)]">
                    No team members found matching your search.
                  </td>
                </tr>
              ) : (
                filteredTeamMembers.map((m) => {
                  const isManagerRole = (m.role || m.hrms_role || "").toLowerCase() === "manager";
                  const memberDepts = (m.departments && m.departments.length > 0)
                    ? m.departments
                    : (m.department ? [m.department] : ["Tech"]);

                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-[var(--line)] hover:bg-[var(--vs)] transition-all ${
                        m.is_active === false ? "opacity-60 bg-gray-50/50" : ""
                      }`}
                    >
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => openMemberModal(m, false)}
                          className="flex items-center gap-3 text-left group hover:opacity-90 transition-all focus:outline-none cursor-pointer"
                          title="Click to view and edit details"
                        >
                          <div className="w-8 h-8 rounded-full bg-[var(--vt2)] flex items-center justify-center font-bold text-xs border border-[var(--ink)] shadow-[1px_1px_0_var(--hard)] group-hover:scale-105 transition-transform flex-shrink-0">
                            {getInitials(m.full_name)}
                          </div>
                          <div>
                            <span className="font-bold text-[var(--ink)] group-hover:text-[var(--v)] group-hover:underline block leading-tight flex items-center gap-1.5">
                              {m.full_name || m.email}
                              <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--v)] flex-shrink-0" />
                            </span>
                            <span className="text-xs font-normal text-[var(--muted)]">{m.email}</span>
                          </div>
                        </button>
                      </td>

                      <td className="py-3 px-3">
                        <select
                          value={isManagerRole ? "manager" : "employee"}
                          onChange={(e) =>
                            handleUpdateMemberAdmin(m.id, {
                              role: e.target.value,
                              hrms_role: e.target.value,
                            })
                          }
                          className="flow-field text-xs py-1"
                        >
                          <option value="employee">Employee</option>
                          <option value="manager">Manager</option>
                        </select>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex gap-1.5 flex-wrap">
                          {["Growth", "Tech"].map((dName) => {
                            const hasDept = memberDepts.includes(dName);
                            return (
                              <button
                                key={dName}
                                type="button"
                                onClick={() => {
                                  const next = hasDept
                                    ? memberDepts.filter((x) => x !== dName)
                                    : [...memberDepts, dName];
                                  const finalDepts = next.length > 0 ? next : ["Tech"];
                                  handleUpdateMemberAdmin(m.id, { departments: finalDepts });
                                }}
                                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                                  hasDept
                                    ? dName === "Growth"
                                      ? "bg-[var(--vt2)] border-[var(--ink)] shadow-[1px_1px_0_var(--hard)] text-[var(--ink)]"
                                      : "bg-[var(--bt)] border-[var(--ink)] shadow-[1px_1px_0_var(--hard)] text-[var(--ink)]"
                                    : "bg-white text-[var(--muted)] border-dashed border-[var(--line2)] opacity-70 hover:opacity-100"
                                }`}
                              >
                                {hasDept ? `✓ ${dName}` : `+ ${dName}`}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => handleUpdateMemberAdmin(m.id, { can_access_crm: !m.can_access_crm })}
                          className={`flow-tag text-xs cursor-pointer transition-all ${
                            m.can_access_crm
                              ? "bg-[var(--vt2)] border-[var(--ink)] shadow-[1px_1px_0_var(--hard)] text-[var(--ink)] font-bold"
                              : "bg-[var(--vs)] text-[var(--muted)] border border-transparent"
                          }`}
                        >
                          {m.can_access_crm ? "CRM On ↗" : "CRM Off ✕"}
                        </button>
                      </td>

                      <td className="py-3 px-3">
                        <select
                          value={m.manager_id || ""}
                          onChange={(e) =>
                            handleUpdateMemberAdmin(m.id, {
                              manager_id: e.target.value || null,
                            })
                          }
                          className="flow-field text-xs py-1"
                        >
                          <option value="">Leadership (Default)</option>
                          {teamMembers
                            .filter((x) => x.id !== m.id && (x.role === "manager" || x.hrms_role === "manager"))
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.full_name}
                              </option>
                            ))}
                        </select>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleUpdateMemberAdmin(m.id, { is_active: m.is_active === false ? true : false })}
                          className={`flow-btn sm text-xs ${
                            m.is_active === false
                              ? "bg-[var(--vt2)] border-[var(--ink)] text-[var(--ink)]"
                              : "bg-white text-[var(--muted)] hover:text-red-600"
                          }`}
                        >
                          {m.is_active === false ? "Resume" : "Pause"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  // Manager saves any employee's profile info
  const handleSaveMemberInfoByManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingMember) return;
    setMemberEditSaving(true);
    setMemberEditError("");
    setMemberEditSuccess("");
    try {
      const payload: any = {
        full_name: memberEditForm.full_name?.trim(),
        email: memberEditForm.email?.trim()?.toLowerCase(),
        emp_code: memberEditForm.emp_code?.trim(),
        role: memberEditForm.role,
        hrms_role: memberEditForm.role,
        departments: memberEditForm.departments,
        manager_id: memberEditForm.manager_id || null,
        can_access_crm: Boolean(memberEditForm.can_access_crm),
        is_active: Boolean(memberEditForm.is_active),
        phone: memberEditForm.phone?.trim() || null,
        personal_email: memberEditForm.personal_email?.trim() || null,
        dob: memberEditForm.dob || null,
        date_joined: memberEditForm.date_joined || null,
        emergency_contact_name: memberEditForm.emergency_contact_name?.trim() || null,
        emergency_contact_phone: memberEditForm.emergency_contact_phone?.trim() || null,
        address: memberEditForm.address?.trim() || null,
        city: memberEditForm.city?.trim() || null,
        state: memberEditForm.state?.trim() || null,
        pin_code: memberEditForm.pin_code?.trim() || null,
        bank_account_holder: memberEditForm.bank_account_holder?.trim() || null,
        bank_name: memberEditForm.bank_name?.trim() || null,
        bank_account_number: memberEditForm.bank_account_number?.trim() || null,
        ifsc_code: memberEditForm.ifsc_code?.trim()?.toUpperCase() || null,
        upi_id: memberEditForm.upi_id?.trim() || null,
      };

      const res = await fetch(`${API_URL}/hrms/team/${viewingMember.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to save employee changes.");
      }

      const updated = { ...viewingMember, ...payload };
      setViewingMember(updated);
      setTeamMembers((prev) => prev.map((t) => (t.id === viewingMember.id ? updated : t)));
      if (profile && profile.id === viewingMember.id) {
        setProfile((prev) => ({ ...prev, ...updated }));
      }
      setMemberEditSuccess("Employee info updated successfully!");
      setTimeout(() => {
        setIsEditingMember(false);
        setMemberEditSuccess("");
      }, 1000);
    } catch (err: any) {
      setMemberEditError(err.message || "Failed to update employee details.");
    } finally {
      setMemberEditSaving(false);
    }
  };

  // Profile Save (Employee Self)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        emergency_contact_name: profileForm.emergency_contact_name,
        emergency_contact_phone: profileForm.emergency_contact_phone,
        address: profileForm.address,
        city: profileForm.city,
        state: profileForm.state,
        pin_code: profileForm.pin_code,
        bank_account_holder: profileForm.bank_account_holder,
        bank_name: profileForm.bank_name,
        bank_account_number: profileForm.bank_account_number,
        ifsc_code: profileForm.ifsc_code,
        upi_id: profileForm.upi_id,
      };
      // Only managers can self-update phone or personal_email
      if (profile?.is_manager) {
        payload.phone = profileForm.phone;
        payload.personal_email = profileForm.personal_email;
      }
      const res = await fetch(`${API_URL}/hrms/me/profile`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setIsProfileDirty(false);
        isProfileDirtyRef.current = false;
        setProfile((prev) => (prev ? { ...prev, ...payload } : null));
        setProfileForm((prev: any) => ({ ...prev, ...payload }));
        showNotification("Profile details saved successfully.");
        if (profile) fetchAllData(token, profile.id, profile);
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification(err.detail || "Failed to save profile.");
      }
    } catch (e: any) {
      showNotification(e.message || "Failed to save profile.");
    }
  };

  // Profile Password Change
  const handleProfilePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfilePwdError("");
    setProfilePwdSuccess("");

    if (!profileNewPwd || profileNewPwd.length < 6) {
      setProfilePwdError("Password must be at least 6 characters long.");
      return;
    }
    if (profileNewPwd !== profileConfirmPwd) {
      setProfilePwdError("New password and confirm password do not match.");
      return;
    }

    setProfilePwdLoading(true);
    try {
      // 1. Update password in Supabase Auth
      const { error: authErr } = await supabase.auth.updateUser({
        password: profileNewPwd,
      });
      if (authErr) {
        throw new Error(authErr.message || "Failed to update password.");
      }

      // 2. Clear must_change_password flag in backend
      try {
        await fetch(`${API_URL}/hrms/me/change-password`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (beErr) {
        console.warn("Backend change-password notice:", beErr);
      }

      // 3. Fallback direct update to profiles table
      try {
        if (profile?.id) {
          await supabase
            .from("profiles")
            .update({ must_change_password: false })
            .eq("id", profile.id);
        }
      } catch (sbErr) {
        console.warn("Profiles update notice:", sbErr);
      }

      setProfile((prev) => (prev ? { ...prev, must_change_password: false } : null));
      setProfilePwdSuccess("Password updated successfully!");
      showNotification("Your password has been changed successfully!");
      setProfileNewPwd("");
      setProfileConfirmPwd("");
    } catch (err: any) {
      setProfilePwdError(err.message || "Could not update password.");
    } finally {
      setProfilePwdLoading(false);
    }
  };

  // Switch Pay Member view (for HR Admin)
  const handleSwitchPayMember = (memberId: string) => {
    setSelectedPayMemberId(memberId);
    loadPayslips(token, memberId);
    loadInsurance(token, memberId);
  };

  // Calendar Day Grid Computation
  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();
    const totalSlots = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    const cells = [];
    for (let i = 0; i < totalSlots; i++) {
      let dayNum = 0;
      let isCurrentMonth = true;
      let m = calMonth;
      let y = calYear;

      if (i < firstDay) {
        dayNum = daysInPrevMonth - firstDay + i + 1;
        isCurrentMonth = false;
        m = calMonth - 1;
        if (m < 0) {
          m = 11;
          y = calYear - 1;
        }
      } else if (i >= firstDay + daysInMonth) {
        dayNum = i - firstDay - daysInMonth + 1;
        isCurrentMonth = false;
        m = calMonth + 1;
        if (m > 11) {
          m = 0;
          y = calYear + 1;
        }
      } else {
        dayNum = i - firstDay + 1;
      }

      const isoDate = `${y}-${String(m + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const holiday = calHolidays.find((h) => h.holiday_date === isoDate);
      const activeLeaves = calendarLeaves.filter(
        (l) => isoDate >= l.start_date && isoDate <= l.end_date
      );

      cells.push({
        dayNum,
        isoDate,
        isCurrentMonth,
        isWeekend: i % 7 === 0 || i % 7 === 6,
        holiday,
        activeLeaves,
      });
    }
    return cells;
  }, [calMonth, calYear, calendarLeaves, calHolidays]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] font-sans">
        <div className="text-center">
          <div className="inline-block animate-spin text-[var(--v)] mb-3">
            <Sparkles size={36} />
          </div>
          <h2 className="text-2xl font-bold text-[var(--ink)]">Connecting to Flowwies...</h2>
          <p className="text-[var(--muted)] text-sm">Not if, but when.</p>
        </div>
      </div>
    );
  }

  // REAL SUPABASE SIGN IN SCREEN
  if (!session || !profile) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="text-3xl font-extrabold tracking-tight mb-6">
              Flow<span className="bg-[var(--vt2)] px-2 py-0.5 rounded-lg -rotate-3 inline-block ml-1">wies</span>
            </div>
            <h1 className="text-6xl md:text-7xl font-extrabold leading-none mb-4 text-[var(--ink)]">
              Not if.<br />
              <span className="inline-block bg-[var(--vt2)] px-3 py-1 rounded-2xl -rotate-2 shadow-[6px_6px_0_var(--hard)]">
                But when.
              </span>
            </h1>
        
          </div>

          <div className="flow-card">
            <h2 className="text-2xl font-bold mb-4">Sign in to Flowwies</h2>

            {loginError && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit}>
              <label className="block text-sm font-bold mb-1">Work email</label>
              <input
                type="email"
                placeholder="name@workfloww.ai"
                className="flow-field mb-4"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
              />
              <label className="block text-sm font-bold mb-1">Password</label>
              <div className="relative mb-6">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  className="flow-field pr-11"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--muted)] hover:text-[var(--ink)] transition-colors focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="flow-btn pri w-full py-3 mb-4 disabled:opacity-50"
              >
                {loginLoading ? "Verifying..." : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // MAIN FLOWWIES DASHBOARD
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      {/* 1. TOP NAVIGATION */}
      <header className="sticky top-0 z-40 bg-[rgba(252,251,255,0.96)] border-b-2 border-[var(--line)] backdrop-blur-md">
        <div className="wrap flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab("home")}
              className="text-2xl md:text-3xl font-black tracking-tight flex items-center"
            >
              <span className="font-black text-[var(--ink)]">Flow</span>
              <span className="bg-[var(--vt2)] px-2.5 py-0.5 rounded-xl -rotate-2 inline-block ml-1 font-black text-[var(--v)] border-2 border-[var(--ink)] shadow-[2px_2px_0_var(--hard)]">
                wies
              </span>
            </button>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => {
                setActiveTab("home");
                setTimeout(() => {
                  const el = document.getElementById("sec-leave");
                  el?.scrollIntoView({ behavior: "smooth" });
                }, 50);
              }}
              className="px-3 py-1.5 rounded-full font-bold text-sm hover:bg-[var(--vt)] transition-all"
            >
              Leave
            </button>
            <button
              onClick={() => setActiveTab("reimbursements")}
              className={`px-3 py-1.5 rounded-full font-bold text-sm hover:bg-[var(--vt)] transition-all ${
                activeTab === "reimbursements" ? "bg-[var(--vt2)] border border-[var(--ink)]" : ""
              }`}
            >
              Reimbursements
            </button>
            <button
              onClick={() => {
                setActiveTab("home");
                setTimeout(() => {
                  const el = document.getElementById("sec-rules");
                  el?.scrollIntoView({ behavior: "smooth" });
                }, 50);
              }}
              className="px-3 py-1.5 rounded-full font-bold text-sm hover:bg-[var(--vt)] transition-all"
            >
              Work Ways
            </button>
            <button
              onClick={() => {
                setActiveTab("home");
                setTimeout(() => {
                  const el = document.getElementById("sec-talent");
                  el?.scrollIntoView({ behavior: "smooth" });
                }, 50);
              }}
              className="px-3 py-1.5 rounded-full font-bold text-sm hover:bg-[var(--vt)] transition-all"
            >
              Talent
            </button>
            <button
              onClick={() => {
                setActiveTab("home");
                setTimeout(() => {
                  const el = document.getElementById("sec-flex");
                  el?.scrollIntoView({ behavior: "smooth" });
                }, 50);
              }}
              className="px-3 py-1.5 rounded-full font-bold text-sm hover:bg-[var(--vt)] transition-all"
            >
              Hall of Flex
            </button>

            {/* People & access: Manager only */}
            {profile.is_manager && (
              <button
                onClick={() => {
                  setActiveTab("access");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`px-3 py-1.5 rounded-full font-bold text-sm transition-all ${
                  activeTab === "access"
                    ? "bg-[var(--vt2)] border border-[var(--ink)] shadow-[2px_2px_0_var(--hard)] text-[var(--ink)]"
                    : "bg-[var(--vs)] border border-[var(--line2)] hover:bg-[var(--vt)]"
                }`}
              >
                People & access
              </button>
            )}
          </nav>

          {/* RIGHT ACTIONS: CRM + PROFILE + SIGN OUT */}
          <div className="flex items-center gap-2 sm:gap-3">
            {profile.can_access_crm && (
              <a
                href="https://crm.workfloww.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="flow-btn pri sm text-xs"
                title="Growth & Leadership CRM portal"
              >
                CRM <ExternalLink size={14} />
              </a>
            )}

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2 border-2 border-[var(--ink)] rounded-full p-1 pr-3 shadow-[2px_2px_0_var(--hard)] transition-all ${
                activeTab === "profile" ? "bg-[var(--vt2)]" : "bg-white hover:bg-[var(--vt)]"
              }`}
              title="View and edit your profile"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--vt2)] border border-[var(--ink)] flex items-center justify-center font-extrabold text-xs">
                {getInitials(profile.full_name)}
              </div>
              <span className="font-extrabold text-xs md:text-sm">Profile</span>
            </button>

            <button
              onClick={() => {
                supabase.auth.signOut();
                setSession(null);
                setProfile(null);
              }}
              className="flow-btn sm text-xs"
              title="Sign out of Flowwies"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN CONTENT BODY */}
      <main className="wrap py-8">
        {/* VIEW 1: REIMBURSEMENTS TAB */}
        {activeTab === "reimbursements" ? (
          <div>
            <div className="mb-8">
              <h2 className="text-4xl font-extrabold mb-2">Spent it? Show the receipt.</h2>
              <p className="text-[var(--muted)]">Not if you get paid back. When the bill is uploaded.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              {/* Submit expense claim form */}
              <div className="flow-card">
                <h3 className="text-xl font-bold mb-4">Claim an expense</h3>
                <form onSubmit={handleSubmitClaim} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold mb-1">Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Cab to client site, Lunch meeting"
                      value={newClaimTitle}
                      onChange={(e) => setNewClaimTitle(e.target.value)}
                      className="flow-field"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="0"
                      min="1"
                      step="any"
                      value={newClaimAmount}
                      onChange={(e) => setNewClaimAmount(e.target.value)}
                      className="flow-field"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-1">Bill receipt or payment screenshot</label>
                    <input
                      type="text"
                      placeholder="bill-receipt.jpg or invoice-001.pdf"
                      value={newClaimFileName}
                      onChange={(e) => setNewClaimFileName(e.target.value)}
                      className="flow-field"
                      required
                    />
                    <p className="text-xs text-[var(--muted)] mt-1">
                      No bill, no refund. Enter receipt filename.
                    </p>
                  </div>
                  <button type="submit" className="flow-btn pri w-full py-2.5">
                    Submit claim
                  </button>
                </form>
              </div>

              {/* Claims Queue */}
              <div className="space-y-6">
                {(profile.is_admin || profile.is_manager) && (
                  <div>
                    <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                      Waiting on you <span className="bg-[var(--vt2)] text-xs px-2 py-0.5 rounded-full font-bold">{claimApprovals.length}</span>
                    </h3>
                    {claimApprovals.length === 0 ? (
                      <div className="p-6 rounded-2xl border-2 border-dashed border-[var(--line2)] text-center text-[var(--muted)] font-bold">
                        No claims waiting. Suspiciously tidy.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {claimApprovals.map((c) => (
                          <div key={c.id} className="flow-card p-4">
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <h4 className="font-bold text-lg">{c.title}</h4>
                                <p className="text-2xl font-extrabold text-[var(--v)]">₹{c.amount.toLocaleString("en-IN")}</p>
                                <p className="text-xs text-[var(--muted)] mt-1">
                                  {c.profiles?.full_name} · {c.claim_date} · {c.receipt_file_name}
                                </p>
                              </div>
                              <span className={`flow-tag ${c.status}`}>{c.status}</span>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {c.status === "pending" && (
                                <>
                                  <button
                                    onClick={() => handleClaimDecision(c.id, "approved")}
                                    className="flow-btn ok sm text-xs"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleClaimDecision(c.id, "declined")}
                                    className="flow-btn sm text-xs"
                                  >
                                    Decline
                                  </button>
                                </>
                              )}

                              {c.status === "approved" && profile.is_admin && (
                                <button
                                  onClick={() => handlePayClaim(c.id)}
                                  className="flow-btn pri sm text-xs font-bold"
                                >
                                  Mark as paid (Pay to {c.profiles?.upi_id || c.profiles?.bank_account_number || "bank account"})
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* My Claims from Database */}
                <div>
                  <h3 className="text-xl font-bold mb-3">Your claims</h3>
                  {myClaims.length === 0 ? (
                    <div className="p-6 rounded-2xl border-2 border-dashed border-[var(--line2)] text-center text-[var(--muted)] font-bold">
                      No claims yet. Keep those bills safe.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {myClaims.map((c) => (
                        <div key={c.id} className="flow-card p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-bold">{c.title}</h4>
                              <p className="text-xl font-extrabold text-[var(--v)]">₹{c.amount.toLocaleString("en-IN")}</p>
                              <p className="text-xs text-[var(--muted)] mt-1">{c.claim_date} · {c.receipt_file_name}</p>
                            </div>
                            <span className={`flow-tag ${c.status}`}>{c.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === "profile" ? (
          /* VIEW 2: PROFILE TAB */
          <div>
            <div className="mb-8">
              <h2 className="text-4xl font-extrabold mb-2">Your profile.</h2>
              <p className="text-[var(--muted)]">Keep these up to date. Payslips and reimbursements use them.</p>
            </div>

            <div className="flex items-center gap-4 mb-8">
              <div className="w-20 h-20 rounded-full bg-[var(--vt2)] border-2 border-[var(--ink)] flex items-center justify-center text-3xl font-extrabold">
                {getInitials(profile.full_name)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-bold">{profile.full_name}</h3>
                  {isProfileDirty && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 font-semibold inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      Unsaved changes
                    </span>
                  )}
                </div>
                <p className="text-[var(--muted)] text-sm mt-0.5">
                  {profile.hrms_role.toUpperCase()} · {profile.department} · {profile.email}
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column: Work, Contact & Address */}
              <div className="space-y-6">
                {/* Work Details & Contact */}
                <div className="flow-card space-y-4">
                  <h3 className="text-xl font-bold mb-2">Work & Contact</h3>
                  <div>
                    <label className="block text-xs font-bold mb-1">Employee ID</label>
                    <input
                      type="text"
                      readOnly
                      value={profile.emp_code || (profile.id ? `FW-${profile.id.replace(/-/g, "").slice(0, 4).toUpperCase()}` : "FW-001")}
                      className="flow-field bg-[var(--vs)] cursor-not-allowed opacity-80"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold">Work email</label>
                      <span className="text-[10px] font-bold text-[var(--muted)] bg-[var(--vs)] px-2 py-0.5 rounded border border-[var(--line)]">
                        Locked · Manager edit only
                      </span>
                    </div>
                    <input type="text" readOnly disabled value={profile.email} className="flow-field bg-[var(--vs)] cursor-not-allowed opacity-80" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold">Mobile phone</label>
                      {!profile.is_manager && (
                        <span className="text-[10px] font-bold text-[var(--muted)] bg-[var(--vs)] px-2 py-0.5 rounded border border-[var(--line)]">
                          Locked · Manager edit only
                        </span>
                      )}
                    </div>
                    <input
                      type="tel"
                      readOnly={!profile.is_manager}
                      disabled={!profile.is_manager}
                      placeholder="10-digit mobile number"
                      value={profileForm.phone || ""}
                      onChange={(e) => handleProfileFieldChange("phone", e.target.value)}
                      className={`flow-field ${!profile.is_manager ? "bg-[var(--vs)] cursor-not-allowed opacity-80" : ""}`}
                    />
                    {!profile.is_manager && (
                      <p className="text-[11px] text-[var(--muted)] mt-1">
                        Employees cannot edit their phone number or email. Contact your manager for updates.
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold">Personal email</label>
                      {!profile.is_manager && (
                        <span className="text-[10px] font-bold text-[var(--muted)] bg-[var(--vs)] px-2 py-0.5 rounded border border-[var(--line)]">
                          Locked · Manager edit only
                        </span>
                      )}
                    </div>
                    <input
                      type="email"
                      readOnly={!profile.is_manager}
                      disabled={!profile.is_manager}
                      placeholder="personal@gmail.com"
                      value={profileForm.personal_email || ""}
                      onChange={(e) => handleProfileFieldChange("personal_email", e.target.value)}
                      className={`flow-field ${!profile.is_manager ? "bg-[var(--vs)] cursor-not-allowed opacity-80" : ""}`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Emergency contact</label>
                      <input
                        type="text"
                        placeholder="Name"
                        value={profileForm.emergency_contact_name || ""}
                        onChange={(e) => handleProfileFieldChange("emergency_contact_name", e.target.value)}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Emergency phone</label>
                      <input
                        type="tel"
                        placeholder="Phone"
                        value={profileForm.emergency_contact_phone || ""}
                        onChange={(e) => handleProfileFieldChange("emergency_contact_phone", e.target.value)}
                        className="flow-field"
                      />
                    </div>
                  </div>
                </div>

                {/* Residential Address Card */}
                <div className="flow-card space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">Residential Address</h3>
                    <span className="text-[11px] text-[var(--muted)]">Self editable</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Street Address</label>
                    <textarea
                      rows={2}
                      placeholder="House / Flat No., Building, Street, Area"
                      value={profileForm.address || ""}
                      onChange={(e) => handleProfileFieldChange("address", e.target.value)}
                      className="flow-field resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">City</label>
                      <input
                        type="text"
                        placeholder="e.g. Mumbai"
                        value={profileForm.city || ""}
                        onChange={(e) => handleProfileFieldChange("city", e.target.value)}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">State</label>
                      <input
                        type="text"
                        placeholder="e.g. Maharashtra"
                        value={profileForm.state || ""}
                        onChange={(e) => handleProfileFieldChange("state", e.target.value)}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">PIN Code</label>
                      <input
                        type="text"
                        placeholder="e.g. 400001"
                        value={profileForm.pin_code || ""}
                        onChange={(e) => handleProfileFieldChange("pin_code", e.target.value)}
                        className="flow-field"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Payout & Bank Info */}
              <div className="flow-card space-y-4 h-fit">
                <h3 className="text-xl font-bold mb-2">Bank & UPI for Reimbursements</h3>
                <div>
                  <label className="block text-xs font-bold mb-1">Account holder name</label>
                  <input
                    type="text"
                    placeholder="Full name as in passbook"
                    value={profileForm.bank_account_holder || ""}
                    onChange={(e) => handleProfileFieldChange("bank_account_holder", e.target.value)}
                    className="flow-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Bank name</label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC Bank, ICICI Bank"
                    value={profileForm.bank_name || ""}
                    onChange={(e) => handleProfileFieldChange("bank_name", e.target.value)}
                    className="flow-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">Account number</label>
                  <div className="relative">
                    <input
                      type={showAccNo ? "text" : "password"}
                      placeholder="9 to 18 digits"
                      value={profileForm.bank_account_number || ""}
                      onChange={(e) => handleProfileFieldChange("bank_account_number", e.target.value)}
                      className="flow-field pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccNo(!showAccNo)}
                      className="absolute right-3 top-3 text-[var(--muted)]"
                    >
                      {showAccNo ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">IFSC Code</label>
                    <input
                      type="text"
                      placeholder="HDFC0001234"
                      value={profileForm.ifsc_code || ""}
                      onChange={(e) => handleProfileFieldChange("ifsc_code", e.target.value.toUpperCase())}
                      className="flow-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">UPI ID</label>
                    <input
                      type="text"
                      placeholder="name@okhdfcbank"
                      value={profileForm.upi_id || ""}
                      onChange={(e) => handleProfileFieldChange("upi_id", e.target.value)}
                      className="flow-field"
                    />
                  </div>
                </div>
                <button type="submit" className="flow-btn pri w-full py-2.5 mt-2 flex items-center justify-center gap-2">
                  <span>Save profile changes</span>
                  {isProfileDirty && <span className="text-xs opacity-75 font-normal">(unsaved)</span>}
                </button>
              </div>
            </form>

            {/* Security & Change Password Card */}
            <div className="mt-8 flow-card max-w-2xl bg-[var(--card)] border-[var(--line2)] shadow-[6px_6px_0_var(--hard)]">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-xl bg-[var(--vt2)] border border-[var(--line2)] text-[var(--v)]">
                  <Lock size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Account Security & Password</h3>
                  <p className="text-[var(--muted)] text-xs">
                    Update your password to keep your Flowwies account secure. Minimum 6 characters.
                  </p>
                </div>
              </div>

              {profilePwdError && (
                <div className="mt-4 p-3 rounded-xl bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-semibold flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{profilePwdError}</span>
                </div>
              )}

              {profilePwdSuccess && (
                <div className="mt-4 p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{profilePwdSuccess}</span>
                </div>
              )}

              <form onSubmit={handleProfilePasswordChange} className="mt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold mb-1">New Password</label>
                    <div className="relative">
                      <input
                        type={showProfileNewPwd ? "text" : "password"}
                        placeholder="At least 6 characters"
                        value={profileNewPwd}
                        onChange={(e) => setProfileNewPwd(e.target.value)}
                        className="flow-field pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowProfileNewPwd(!showProfileNewPwd)}
                        className="absolute right-3 top-3 text-[var(--muted)] hover:text-[var(--ink)]"
                      >
                        {showProfileNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showProfileConfirmPwd ? "text" : "password"}
                        placeholder="Re-enter password"
                        value={profileConfirmPwd}
                        onChange={(e) => setProfileConfirmPwd(e.target.value)}
                        className="flow-field pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowProfileConfirmPwd(!showProfileConfirmPwd)}
                        className="absolute right-3 top-3 text-[var(--muted)] hover:text-[var(--ink)]"
                      >
                        {showProfileConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={profilePwdLoading}
                    className="flow-btn pri py-2.5 px-6 flex items-center gap-2"
                  >
                    {profilePwdLoading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Updating password...
                      </>
                    ) : (
                      <>
                        <Lock size={16} />
                        Update Password
                      </>
                    )}
                  </button>
                  {profileNewPwd && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfileNewPwd("");
                        setProfileConfirmPwd("");
                        setProfilePwdError("");
                        setProfilePwdSuccess("");
                      }}
                      className="flow-btn py-2.5 px-4 text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        ) : activeTab === "access" && profile.is_manager ? (
          /* VIEW 3: PEOPLE & ACCESS DEDICATED VIEW (MANAGER ONLY) */
          <div>
            {renderPeopleAndAccess(true)}
          </div>
        ) : (
          /* VIEW 4: HOME DASHBOARD (Hero, Leave, Calendar, Pay, Rules, Talent, Wall, Access) */
          <div className="space-y-16">
            {/* HERO FRONT PAGE SECTION */}
            <section className="min-h-[calc(100vh-6rem)] flex flex-col justify-between py-10 md:py-16">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto">
                <div className="lg:col-span-7">
                  <h1 className="text-5xl md:text-7xl font-extrabold leading-tight">
                    Not if.<br />
                    <span className="inline-block bg-[var(--vt2)] px-3 py-1 rounded-2xl -rotate-2 shadow-[6px_6px_0_var(--hard)]">
                      But when.
                    </span>
                  </h1>
                  <p className="text-2xl font-bold text-[var(--v)] mt-6 min-h-[1.5em] transition-all">
                    {quotes[quoteIdx]}
                  </p>
                  <p className="text-[var(--muted)] text-base mt-2 max-w-lg">
                    Hi {profile.full_name.split(" ")[0]}. Flowwies is where Workfloww.ai keeps leave, rules and applause.
                  </p>

                  <div className="flex flex-wrap gap-3 mt-6">
                    <button
                      onClick={() => { const el = document.getElementById("sec-leave"); el?.scrollIntoView({ behavior: "smooth" }); }}
                      className="flow-btn pri"
                    >
                      Apply for leave
                    </button>
                    <button
                      onClick={() => setActiveTab("reimbursements")}
                      className="flow-btn"
                    >
                      Claim an expense
                    </button>
                    <button
                      onClick={() => { const el = document.getElementById("sec-flex"); el?.scrollIntoView({ behavior: "smooth" }); }}
                      className="flow-btn"
                    >
                      See who&apos;s flexing
                    </button>
                  </div>
                </div>

                {/* Quick Stat Cards */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="flow-card transform rotate-1 bg-[var(--vt2)] border-[var(--line2)] p-6 shadow-[4px_4px_0_var(--hard)]">
                    <div className="text-5xl font-extrabold">{pendingLeaveCount}</div>
                    <small className="font-bold text-sm block mt-2 text-[var(--ink)]">
                      {profile.is_manager || profile.is_admin
                        ? "requests waiting on your team decision"
                        : "of your requests waiting on decision"}
                    </small>
                  </div>

                  <div className="flow-card transform -rotate-1 bg-[var(--bt)] border-[var(--line2)] p-6 shadow-[4px_4px_0_var(--hard)]">
                    <div className="text-5xl font-extrabold">{nextHoliday ? nextHoliday.days_away : 0}</div>
                    <small className="font-bold text-sm block mt-2 text-[var(--ink)]">
                      days to {nextHoliday ? nextHoliday.name : "upcoming company holiday"}
                    </small>
                  </div>

                  <div className="flow-card bg-white dark:bg-[var(--card)] border-[var(--line2)] p-5 flex items-center justify-between shadow-[4px_4px_0_var(--hard)]">
                    <div>
                      <div className="text-xs uppercase font-extrabold tracking-wider text-[var(--v)]">Monthly Leave Balance</div>
                      <div className="text-2xl font-black mt-0.5">
                        {leaveBalance.remaining_this_month !== undefined ? leaveBalance.remaining_this_month : 2} / 2 left this month
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">Renews automatically on the 1st</div>
                    </div>
                    <button
                      onClick={() => { const el = document.getElementById("sec-leave"); el?.scrollIntoView({ behavior: "smooth" }); }}
                      className="flow-btn sm text-xs"
                    >
                      Manage &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* LEAVE & CALENDAR SECTION (Down Below) */}
            <section id="sec-leave" className="pt-20 border-t-2 border-[var(--line2)] scroll-mt-20">
              <div className="mb-6">
                <h2 className="text-4xl font-extrabold">Leave, decided.</h2>
                <p className="text-[var(--muted)]">Request it, approve it, see it on the calendar.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Apply Form & Approvals */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Monthly Leave Allowance Summary (2 leaves per month, renews every month) */}
                  <div className="p-4 rounded-2xl border-2 border-[var(--line)] bg-[var(--vt)]/30 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--v)] flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[var(--v)] animate-pulse"></span>
                        Monthly Leave Quota
                      </span>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white border border-[var(--line2)] text-[var(--ink)]">
                        Renews on 1st of every month
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-3 bg-white rounded-xl border border-[var(--line2)] shadow-[2px_2px_0_var(--shadow)] text-center">
                        <div className="text-2xl font-black text-[var(--v)]">
                          {leaveBalance.remaining_this_month !== undefined ? leaveBalance.remaining_this_month : 2}
                        </div>
                        <div className="text-[10px] uppercase font-bold text-[var(--muted)] mt-0.5">Left this month</div>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-[var(--line2)] shadow-[2px_2px_0_var(--shadow)] text-center">
                        <div className="text-2xl font-black text-[var(--hard)]">
                          {leaveBalance.used_this_month !== undefined ? leaveBalance.used_this_month : 0}
                        </div>
                        <div className="text-[10px] uppercase font-bold text-[var(--muted)] mt-0.5">Used this month</div>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-[var(--line2)] shadow-[2px_2px_0_var(--shadow)] text-center">
                        <div className="text-2xl font-black text-[var(--ink)]">
                          {leaveBalance.monthly_quota || 2.0}
                        </div>
                        <div className="text-[10px] uppercase font-bold text-[var(--muted)] mt-0.5">Monthly Quota</div>
                      </div>
                    </div>

                    <div className="text-[11px] font-medium text-[var(--muted)] leading-tight pt-1">
                      📌 <b>Policy:</b> Exactly <b>2 leaves in a month</b> that renews every month. Employees also stay on official <b>Birthday Leave 🎂</b> on their birthday.
                    </div>
                  </div>

                  {/* Apply Box */}
                  <div className="flow-card">
                    <h3 className="text-lg font-bold mb-3">Ask for time off</h3>
                    <form onSubmit={handleApplyLeave} className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold mb-1">Leave Type</label>
                        <select
                          value={applyType}
                          onChange={(e: any) => setApplyType(e.target.value)}
                          className="flow-field"
                        >
                          <option value="Monthly">Monthly Leave (2/month entitlement)</option>
                          <option value="Casual">Casual Leave</option>
                          <option value="Sick">Sick Leave</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-bold mb-1">From</label>
                          <input
                            type="date"
                            value={applyStart}
                            onChange={(e) => setApplyStart(e.target.value)}
                            className="flow-field"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1">To</label>
                          <input
                            type="date"
                            value={applyEnd}
                            onChange={(e) => setApplyEnd(e.target.value)}
                            className="flow-field"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold mb-1">Reason</label>
                        <input
                          type="text"
                          placeholder="Short and honest"
                          value={applyReason}
                          onChange={(e) => setApplyReason(e.target.value)}
                          className="flow-field"
                          required
                        />
                      </div>

                      <button type="submit" className="flow-btn pri w-full py-2.5">
                        Send request
                      </button>
                    </form>
                    <p className="text-xs text-[var(--muted)] mt-3">
                      Routes directly to leadership (Shilpa &amp; Manish).
                    </p>
                  </div>

                  {/* Waiting on you (Managers & HR Admins) */}
                  {(profile.is_admin || profile.is_manager) && (
                    <div className="space-y-3">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        Waiting on you <span className="bg-[var(--vt2)] text-xs px-2 py-0.5 rounded-full font-bold">{leaveApprovals.length}</span>
                      </h3>
                      {leaveApprovals.length === 0 ? (
                        <div className="p-4 rounded-xl border-2 border-dashed border-[var(--line2)] text-center text-sm font-bold text-[var(--muted)]">
                          Inbox zero. Go get a chai. ☕
                        </div>
                      ) : (
                        leaveApprovals.map((r) => (
                          <div key={r.id} className="flow-card p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-bold">{r.profiles?.full_name || "Colleague"}</h4>
                                <span className="text-xs text-[var(--muted)]">
                                  {r.start_date} to {r.end_date} · {r.days_count} day(s)
                                </span>
                                <p className="italic text-sm mt-1">&ldquo;{r.reason}&rdquo;</p>
                              </div>
                              <span className="flow-tag approved">{r.leave_type}</span>
                            </div>

                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() => handleLeaveDecision(r.id, "approved")}
                                className="flow-btn ok sm text-xs"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleLeaveDecision(r.id, "declined")}
                                className="flow-btn sm text-xs"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Your Requests from Database */}
                  <div>
                    <h3 className="font-bold text-lg mb-2">Your requests</h3>
                    {myLeaves.length === 0 ? (
                      <div className="p-4 rounded-xl border-2 border-dashed border-[var(--line2)] text-center text-sm font-bold text-[var(--muted)]">
                        Nothing requested yet. Rest is allowed.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {myLeaves.map((r) => (
                          <div key={r.id} className="flow-card p-3 flex justify-between items-center">
                            <div>
                              <p className="font-bold text-sm">{r.leave_type} Leave ({r.days_count}d)</p>
                              <p className="text-xs text-[var(--muted)]">{r.start_date} to {r.end_date}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`flow-tag ${r.status}`}>{r.status}</span>
                              {r.status === "pending" && (
                                <button
                                  onClick={() => handleWithdrawLeave(r.id)}
                                  className="text-xs text-[var(--muted)] hover:text-red-500 font-bold"
                                >
                                  Withdraw
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Team Calendar Grid */}
                <div className="lg:col-span-7">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <h3 className="text-2xl font-extrabold flex items-center gap-2">
                        {MONTHS[calMonth]} {calYear}
                      </h3>
                      <p className="text-xs text-[var(--muted)]">Holidays, leaves & employee birthdays</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {profile.is_manager && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAddHolidayModal(true)}
                            className="px-2.5 py-1.5 rounded-lg border-2 border-[var(--line)] bg-white text-xs font-bold hover:bg-[var(--vt)] transition-all flex items-center gap-1 shadow-sm"
                            title="Add a single company holiday"
                          >
                            <span className="text-[var(--v)] font-extrabold">+</span> Holiday
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowUploadHolidayModal(true)}
                            className="px-2.5 py-1.5 rounded-lg border-2 border-[var(--line)] bg-white text-xs font-bold hover:bg-[var(--vt)] transition-all flex items-center gap-1 shadow-sm"
                            title="Upload holiday calendar (CSV / text)"
                          >
                            <span>⬆</span> Upload Calendar
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-1 ml-1">
                        <button
                          onClick={() => {
                            const nm = calMonth === 0 ? 11 : calMonth - 1;
                            const ny = calMonth === 0 ? calYear - 1 : calYear;
                            setCalMonth(nm);
                            setCalYear(ny);
                            loadCalendar(token, nm, ny);
                          }}
                          className="w-9 h-9 rounded-lg border-2 border-[var(--line2)] flex items-center justify-center font-bold hover:bg-[var(--vt)]"
                        >
                          ‹
                        </button>
                        <button
                          onClick={() => {
                            const nm = calMonth === 11 ? 0 : calMonth + 1;
                            const ny = calMonth === 11 ? calYear + 1 : calYear;
                            setCalMonth(nm);
                            setCalYear(ny);
                            loadCalendar(token, nm, ny);
                          }}
                          className="w-9 h-9 rounded-lg border-2 border-[var(--line2)] flex items-center justify-center font-bold hover:bg-[var(--vt)]"
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Calendar DOM */}
                  <div className="border-2 border-[var(--line)] rounded-2xl overflow-hidden bg-white shadow-[0_10px_30px_var(--shadow)]">
                    <div className="grid grid-cols-7 border-b-2 border-[var(--line)] bg-[var(--vt)]">
                      {DOW.map((d, i) => (
                        <div key={i} className="py-2 text-center text-xs font-bold">
                          {d}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7">
                      {calendarCells.map((cell, idx) => (
                        <div
                          key={idx}
                          className={`min-h-[85px] p-1.5 border-r border-b border-[var(--line)] text-xs font-bold overflow-hidden ${
                            idx % 7 === 6 ? "border-r-0" : ""
                          } ${cell.isWeekend ? "bg-[var(--vs)]" : ""} ${
                            !cell.isCurrentMonth ? "opacity-35" : ""
                          }`}
                        >
                          <span className="inline-block px-1.5 py-0.5 rounded-full">{cell.dayNum}</span>

                          {cell.holiday && (
                            <div className="group relative mt-1">
                              <span className="block text-[10px] text-[var(--v)] bg-[var(--vt)] border border-[var(--v)]/30 rounded px-1.5 py-0.5 font-bold truncate">
                                🎉 {cell.holiday.name}
                              </span>
                              {profile.is_manager && cell.holiday.id && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteHoliday(cell.holiday.id);
                                  }}
                                  className="hidden group-hover:inline-block absolute right-0.5 top-0.5 text-[9px] bg-red-100 text-red-600 rounded px-1 font-bold hover:bg-red-200"
                                  title="Delete Holiday"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          )}

                          {cell.activeLeaves.map((l, li) => {
                            if (l.is_birthday) {
                              return (
                                <span
                                  key={li}
                                  className="block mt-1 text-[10px] rounded px-1.5 py-0.5 truncate border border-pink-400 bg-pink-100 text-pink-900 font-extrabold shadow-sm"
                                  title={`${l.profiles?.full_name}: Official Birthday Leave`}
                                >
                                  🎂 {l.profiles?.full_name?.split(" ")[0] || "Colleague"} (Birthday)
                                </span>
                              );
                            }
                            return (
                              <span
                                key={li}
                                className={`block mt-1 text-[10px] rounded px-1.5 py-0.5 truncate border border-[var(--line2)] ${
                                  l.status === "pending" ? "border-dashed opacity-80" : ""
                                }`}
                                style={{ background: l.profiles?.avatar_color || "#E6E0FF" }}
                                title={`${l.profiles?.full_name}: ${l.leave_type} (${l.status})`}
                              >
                                {getInitials(l.profiles?.full_name)} {l.leave_type}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-[var(--muted)] font-bold">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-[var(--v)] inline-block"></span> Violet = Company Holiday
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-pink-200 border border-pink-400 inline-block"></span> 🎂 Pink = Birthday Leave (Auto-granted)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded border border-dashed border-[var(--ink)] inline-block"></span> Dashed = Pending Approval
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* PAY & COVER SECTION (from public.payslips and public.insurance_cover) */}
            {/* <section className="pt-8">
              <div className="mb-6">
                <h2 className="text-4xl font-extrabold">Your money. Your cover.</h2>
                <p className="text-[var(--muted)]">Payslips are published on the 1st of every month.</p>
              </div>

              {/* Admin Employee Switcher */}
              {/* {profile.is_admin && (
                <div className="flex gap-2 flex-wrap mb-4">
                  {teamMembers.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleSwitchPayMember(m.id)}
                      className={`flow-tag cursor-pointer ${
                        selectedPayMemberId === m.id ? "bg-[var(--vt2)] border-[var(--ink)]" : "bg-white"
                      }`}
                    >
                      {m.full_name} {m.id === profile.id ? "(You)" : ""}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8"> */}
                {/* Payslips Card from public.payslips */}
                {/* <div className="flow-card">
                  <h3 className="text-2xl font-bold mb-2">Payslips</h3>
                  <p className="text-xs text-[var(--muted)] mb-4">Net salary deposits &amp; form-16 summaries.</p>
                  
                  {payslips.length === 0 ? (
                    <div className="p-6 rounded-2xl border-2 border-dashed border-[var(--line2)] text-center text-[var(--muted)] font-bold text-sm">
                      No payslips found in the payslips table for this user.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {payslips.map((slip) => (
                        <div key={slip.id} className="flex items-center justify-between py-2 border-b-2 border-dashed border-[var(--line)]">
                          <div>
                            <b className="block text-base">{slip.month_year}</b>
                            <span className="text-xs font-bold text-[var(--v)]">Net pay ₹{slip.net_amount.toLocaleString("en-IN")}</span>
                          </div>
                          <button
                            onClick={() => showNotification("Payslip download: File saved.")}
                            className="flow-btn sm text-xs"
                          >
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div> */}

                {/* Insurance GMC Card from public.insurance_cover */}
                {/* <div className="flow-card bg-[var(--vt)]">
                  <h3 className="text-2xl font-bold mb-3">Group Health Insurance</h3>
                  {insurance ? (
                    <dl className="grid grid-cols-3 gap-2 text-sm mb-6">
                      <dt className="font-bold text-[var(--muted)]">Policy No:</dt>
                      <dd className="col-span-2 font-mono font-bold">{insurance.policy_number}</dd>

                      <dt className="font-bold text-[var(--muted)]">Cover:</dt>
                      <dd className="col-span-2 font-bold text-[var(--v)]">{insurance.cover_amount}</dd>

                      <dt className="font-bold text-[var(--muted)]">Covered:</dt>
                      <dd className="col-span-2 font-semibold">{insurance.dependents}</dd>
                    </dl>
                  ) : (
                    <p className="text-xs text-[var(--muted)] mb-6">
                      No cover details added yet in insurance_cover table.
                    </p>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => showNotification("E-card downloaded.")}
                      className="flow-btn sm text-xs"
                    >
                      Download e-card
                    </button>
                    <button
                      onClick={() => showNotification("Cashless claim desk notified.")}
                      className="flow-btn pri sm text-xs"
                    >
                      Raise hospital claim
                    </button>
                  </div>
                </div>
              </div>
            </section> */}

            {/* RULES / POLICIES SECTION (from public.company_policies) */}
            <section id="sec-rules" className="pt-16 border-t-2 border-[var(--line2)] scroll-mt-20">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-4xl font-extrabold">The Work Ways, in English.</h2>
                  <p className="text-[var(--muted)]">Short enough to read. Click to open.</p>
                </div>
                {(profile.is_manager || profile.is_admin) && (
                  <button
                    onClick={() => setShowAddRuleModal(true)}
                    className="flow-btn pri sm flex items-center gap-2"
                  >
                    <Plus size={16} /> Upload / Add Rule
                  </button>
                )}
              </div>

              {policies.length === 0 ? (
                <div className="p-6 rounded-2xl border-2 border-dashed border-[var(--line2)] text-center text-[var(--muted)] font-bold text-sm">
                  No policies found in company_policies table.
                  {(profile.is_manager || profile.is_admin) && (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowAddRuleModal(true)}
                        className="flow-btn pri sm"
                      >
                        + Upload First Rule
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {policies.map((p) => (
                    <details
                      key={p.id}
                      className="border-2 border-[var(--line)] rounded-2xl p-4 bg-white transition-all"
                    >
                      <summary className="font-bold text-xl cursor-pointer list-none flex justify-between items-center">
                        <span>{p.title}</span>
                        <span className="text-[var(--v)] font-extrabold text-2xl">+</span>
                      </summary>

                      <div className="mt-3 pt-3 border-t border-[var(--line)]">
                        <span className="font-bold text-[var(--v)] block mb-1">{p.punchline}</span>
                        {editingPolicyId === p.id ? (
                          <div className="space-y-2 mt-2">
                            <textarea
                              value={editPolicyBody}
                              onChange={(e) => setEditPolicyBody(e.target.value)}
                              className="flow-field min-h-[90px]"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSavePolicy(p.id)}
                                className="flow-btn ok sm text-xs"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingPolicyId(null)}
                                className="flow-btn sm text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm text-[var(--ink)] whitespace-pre-line">{p.body}</p>
                            {(profile.is_manager || profile.is_admin) && (
                              <div className="flex items-center gap-2 mt-3">
                                <button
                                  onClick={() => { setEditingPolicyId(p.id); setEditPolicyBody(p.body); }}
                                  className="flow-btn sm text-xs"
                                >
                                  Edit rule
                                </button>
                                <button
                                  onClick={() => handleDeletePolicy(p.id)}
                                  className="flow-btn sm text-xs text-red-600 hover:bg-red-50 flex items-center gap-1"
                                >
                                  <Trash2 size={13} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>

            {/* ADD/UPLOAD RULE MODAL (MANAGER ONLY) */}
            {showAddRuleModal && (profile.is_manager || profile.is_admin) && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[var(--card)] border-2 border-[var(--hard)] rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-[8px_8px_0_var(--hard)] space-y-5 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileText size={22} className="text-[var(--v)]" />
                        <h3 className="text-2xl font-extrabold">Upload / Add Rule</h3>
                      </div>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Publish an official company rule or policy. Short, crystal clear English.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowAddRuleModal(false)}
                      className="p-1 rounded-full hover:bg-[var(--vs)] text-[var(--muted)]"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Document Uploader */}
                  <div className="p-3.5 rounded-2xl bg-[var(--vs)] border border-dashed border-[var(--line2)] text-center">
                    <label className="cursor-pointer block">
                      <Upload size={20} className="mx-auto text-[var(--v)] mb-1" />
                      <span className="text-xs font-bold text-[var(--v)] block">Upload rule document (.txt, .md, .pdf)</span>
                      <span className="text-[11px] text-[var(--muted)]">Click to attach or auto-fill text</span>
                      <input
                        type="file"
                        accept=".txt,.md,.pdf,.doc,.docx"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (!newRuleTitle) {
                              const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
                              setNewRuleTitle(cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1));
                            }
                            if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                setNewRuleBody(evt.target?.result as string || "");
                              };
                              reader.readAsText(file);
                            } else {
                              setNewRulePunchline(`Policy document attached: ${file.name}`);
                              setNewRuleBody(`Official policy document: ${file.name}\n\nRefer to company repository or reach out to HR for full documentation.`);
                            }
                          }
                        }}
                      />
                    </label>
                  </div>

                  <form onSubmit={handleAddPolicy} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold mb-1">Rule Title *</label>
                      <input
                        type="text"
                        placeholder="e.g. Leave & Holidays, Work From Anywhere"
                        value={newRuleTitle}
                        onChange={(e) => setNewRuleTitle(e.target.value)}
                        className="flow-field"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1">Punchline / Summary</label>
                      <input
                        type="text"
                        placeholder="e.g. Work where you are most productive. No questions asked."
                        value={newRulePunchline}
                        onChange={(e) => setNewRulePunchline(e.target.value)}
                        className="flow-field"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1">Rule Details *</label>
                      <textarea
                        rows={4}
                        placeholder="Write rule guidelines in simple, concise English..."
                        value={newRuleBody}
                        onChange={(e) => setNewRuleBody(e.target.value)}
                        className="flow-field"
                        required
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAddRuleModal(false)}
                        className="flow-btn sm text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={ruleUploading}
                        className="flow-btn pri sm text-xs flex items-center gap-2"
                      >
                        {ruleUploading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                        Publish Rule
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* TALENT OF THE MONTH (from public.talent_of_the_month) */}
            <section id="sec-talent" className="pt-16 border-t-2 border-[var(--line2)] scroll-mt-20">
              {(() => {
                const selectedMonthYear = `${MONTHS[talentMonth]} ${talentYear}`;
                const selectedTalent =
                  allTalents.find(
                    (t) => t?.month_year?.trim().toLowerCase() === selectedMonthYear.toLowerCase()
                  ) ||
                  (talent?.month_year?.trim().toLowerCase() === selectedMonthYear.toLowerCase()
                    ? talent
                    : null);

                return (
                  <>
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-4xl font-extrabold">Talent of the Month</h2>
                        <p className="text-[var(--muted)]">One person, one month, zero ambiguity.</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {/* Month & Year Selector */}
                        <div className="flex items-center gap-1.5 bg-white dark:bg-[var(--card)] p-1.5 rounded-2xl border-2 border-[var(--ink)] shadow-[3px_3px_0_var(--hard)]">
                          <button
                            type="button"
                            onClick={() => {
                              if (talentMonth === 0) {
                                setTalentMonth(11);
                                setTalentYear((y) => y - 1);
                              } else {
                                setTalentMonth((m) => m - 1);
                              }
                            }}
                            className="p-1 rounded-xl hover:bg-[var(--vs)] transition-all text-[var(--muted)] hover:text-[var(--ink)]"
                            title="Previous month"
                          >
                            <ChevronLeft size={16} />
                          </button>

                          <div className="flex items-center gap-1.5 px-1 font-bold text-xs">
                            <select
                              value={talentMonth}
                              onChange={(e) => setTalentMonth(Number(e.target.value))}
                              className="bg-transparent font-bold text-xs text-[var(--ink)] focus:outline-none cursor-pointer py-1"
                            >
                              {MONTHS.map((m, idx) => (
                                <option key={m} value={idx}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <select
                              value={talentYear}
                              onChange={(e) => setTalentYear(Number(e.target.value))}
                              className="bg-transparent font-bold text-xs text-[var(--ink)] focus:outline-none cursor-pointer py-1"
                            >
                              {[2024, 2025, 2026, 2027].map((y) => (
                                <option key={y} value={y}>
                                  {y}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (talentMonth === 11) {
                                setTalentMonth(0);
                                setTalentYear((y) => y + 1);
                              } else {
                                setTalentMonth((m) => m + 1);
                              }
                            }}
                            className="p-1 rounded-xl hover:bg-[var(--vs)] transition-all text-[var(--muted)] hover:text-[var(--ink)]"
                            title="Next month"
                          >
                            <ChevronRight size={16} />
                          </button>

                          {(talentMonth !== new Date().getMonth() || talentYear !== new Date().getFullYear()) && (
                            <button
                              type="button"
                              onClick={() => {
                                setTalentMonth(new Date().getMonth());
                                setTalentYear(new Date().getFullYear());
                              }}
                              className="text-[11px] font-bold text-[var(--v)] hover:underline px-2 py-0.5 rounded-lg hover:bg-[var(--vs)] transition-all"
                            >
                              This Month
                            </button>
                          )}
                        </div>

                        {(profile.is_manager || profile.is_admin) && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--vt2)] border border-[var(--ink)] shadow-[2px_2px_0_var(--hard)]">
                            <Award size={14} className="text-[var(--v)]" /> Manager Publishing Active
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={`grid grid-cols-1 ${(profile.is_manager || profile.is_admin) ? "lg:grid-cols-12" : "w-full"} gap-8 items-start`}>
                      {/* Crowned Winner Card for Selected Month */}
                      <div className={`${(profile.is_manager || profile.is_admin) ? "lg:col-span-7" : "w-full"} flow-card bg-white dark:bg-[var(--card)] border-2 border-[var(--line2)] shadow-[6px_6px_0_var(--hard)] p-8 md:p-12 transition-all`}>
                        {selectedTalent ? (
                          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                            <div className="w-24 h-24 rounded-full bg-[var(--vt2)] border-2 border-[var(--ink)] text-[var(--v)] font-extrabold text-3xl flex items-center justify-center shrink-0 shadow-[4px_4px_0_var(--hard)]">
                              {getInitials(selectedTalent.profiles?.full_name)}
                            </div>
                            <div className="flex-1 text-center sm:text-left space-y-2.5">
                              <div className="inline-block px-3 py-1 rounded-full text-xs font-extrabold bg-[var(--bt)] border border-[var(--ink)] uppercase tracking-wider">
                                ⭐ Crowned Champion · {selectedTalent.month_year}
                              </div>
                              <h3 className="text-3xl md:text-4xl font-black text-[var(--ink)]">
                                {selectedTalent.profiles?.full_name}
                              </h3>
                              <p className="text-sm font-bold text-[var(--muted)]">
                                {selectedTalent.profiles?.department} · {selectedTalent.month_year}
                              </p>
                              <p className="text-lg md:text-xl font-bold text-[var(--v)] italic py-1">
                                &ldquo;{selectedTalent.why_text}&rdquo;
                              </p>
                              <div className="pt-2 flex items-center gap-3 flex-wrap">
                                <button
                                  onClick={() => handleCheer(selectedTalent.id)}
                                  className="flow-btn pri py-2.5 px-5 text-sm font-extrabold shadow-[3px_3px_0_var(--hard)]"
                                >
                                  👏 Cheer {selectedTalent.cheers_count || 0}
                                </button>
                                {profile.is_manager && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTalent(selectedTalent.id, selectedTalent.profiles?.full_name, selectedTalent.month_year)}
                                    className="p-2.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-600 transition-all shadow-[2px_2px_0_var(--hard)] hover:scale-105 active:scale-95 text-xs font-bold flex items-center gap-1.5"
                                    title={`Remove ${selectedTalent.profiles?.full_name} for ${selectedTalent.month_year}`}
                                  >
                                    <Trash2 size={14} /> Remove Winner
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-10 md:py-14 max-w-lg mx-auto space-y-3">
                            <div className="w-16 h-16 rounded-2xl bg-[var(--vt2)] border-2 border-[var(--ink)] flex items-center justify-center mx-auto text-[var(--v)] shadow-[4px_4px_0_var(--hard)] transform -rotate-3">
                              <Award size={34} />
                            </div>
                            <h3 className="text-2xl font-extrabold text-[var(--ink)] pt-1">
                              No Talent Crowned Yet For {selectedMonthYear}
                            </h3>
                            <p className="text-[var(--muted)] text-sm leading-relaxed">
                              The spotlight is open. Consistency, teamwork, and excellence will be crowned here by team leadership.
                            </p>
                            {(profile.is_manager || profile.is_admin) ? (
                              <div className="pt-2">
                                <span className="inline-block px-3.5 py-1 rounded-full text-xs font-bold bg-[var(--vt)] border border-[var(--line2)] text-[var(--v)]">
                                  👉 Select a teammate and publish directly on the right!
                                </span>
                              </div>
                            ) : (
                              <div className="pt-2">
                                <span className="inline-block px-4 py-1.5 rounded-full text-xs font-bold bg-[var(--vs)] border border-[var(--line2)] text-[var(--muted)]">
                                  Announced at the end of {selectedMonthYear}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Direct Publish Card (VISIBLE TO MANAGERS) */}
                      {(profile.is_manager || profile.is_admin) && (
                        <div className="lg:col-span-5 flow-card bg-white dark:bg-[var(--card)] border-2 border-[var(--line2)] shadow-[6px_6px_0_var(--hard)] p-6 space-y-4">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-[var(--vt2)] border border-[var(--line2)] text-[var(--v)]">
                              <Award size={18} />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold">Publish Talent of the Month</h3>
                              <p className="text-xs text-[var(--muted)]">Directly crown and publish the champion for the team.</p>
                            </div>
                          </div>

                          <form onSubmit={handlePublishTalent} className="space-y-3.5 pt-1">
                            <div>
                              <label className="block text-xs font-bold mb-1">Select Teammate</label>
                              <select
                                value={nomineeId}
                                onChange={(e) => setNomineeId(e.target.value)}
                                className="flow-field"
                              >
                                {teamMembers
                                  .filter((m) => m.id !== profile.id)
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.full_name} ({m.department})
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-bold">Month & Year</label>
                                <span className="text-[10px] font-bold text-[var(--v)] bg-[var(--vt)] px-1.5 py-0.5 rounded border border-[var(--line2)]">
                                  {selectedMonthYear}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  value={talentMonth}
                                  onChange={(e) => setTalentMonth(Number(e.target.value))}
                                  className="flow-field text-xs py-1.5"
                                >
                                  {MONTHS.map((m, idx) => (
                                    <option key={m} value={idx}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={talentYear}
                                  onChange={(e) => setTalentYear(Number(e.target.value))}
                                  className="flow-field text-xs py-1.5"
                                >
                                  {[2024, 2025, 2026, 2027].map((y) => (
                                    <option key={y} value={y}>
                                      {y}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-bold mb-1">Citation / Why they earned it</label>
                              <textarea
                                rows={3}
                                placeholder="e.g. Shipped new auth flow ahead of sprint and exceeded team KPIs."
                                value={nominateWhy}
                                onChange={(e) => setNominateWhy(e.target.value)}
                                className="flow-field text-xs resize-none"
                                required
                              />
                            </div>

                            <button
                              type="submit"
                              className="flow-btn pri w-full py-2.5 text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-[3px_3px_0_var(--hard)] hover:scale-[1.01] active:scale-[0.99] transition-all"
                            >
                              <span>👑 Crown & Publish Winner</span>
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </section>

            {/* HALL OF FLEX (from public.talent_of_the_month where is_current = false) */}
            <section id="sec-flex" className="pt-8">
              <div className="mb-6 flex items-center gap-3">
                <h2 className="text-4xl font-extrabold">Hall of Flex</h2>
                <span className="bg-[var(--vt)] border border-[var(--ink)] text-xs font-bold px-3 py-1 rounded-full -rotate-2">
                  formerly &ldquo;Hall of Fame&rdquo;
                </span>
              </div>
              <p className="text-[var(--muted)] mb-6">Everyone who made the month look easy. Receipts included.</p>

              {wall.length === 0 ? (
                <div className="p-8 rounded-2xl border-2 border-dashed border-[var(--line2)] text-center text-[var(--muted)] font-bold">
                  No past winners in the Hall of Flex yet. Crown a nominee to inaugurate the wall!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                  {[...wall]
                    .sort((a, b) => parseMonthYearSortKey(a?.month_year) - parseMonthYearSortKey(b?.month_year))
                    .map((w, idx) => (
                    <div
                      key={w.id || idx}
                      className={`p-5 rounded-2xl border-2 border-[var(--line2)] shadow-[5px_5px_0_var(--hard)] transition-transform hover:scale-105 relative group ${
                        idx % 4 === 0 ? "bg-[var(--vt2)] -rotate-2" :
                        idx % 4 === 1 ? "bg-[var(--bt)] rotate-2" :
                        idx % 4 === 2 ? "bg-[var(--vt)] -rotate-1" :
                        "bg-[var(--vs)] rotate-1"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-[var(--muted)] block">{w.month_year}</span>
                        {profile.is_manager && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTalent(w.id, w.profiles?.full_name, w.month_year);
                            }}
                            className="p-1 rounded-md bg-white/80 hover:bg-rose-100 text-rose-600 border border-[var(--line2)] shadow-sm opacity-80 group-hover:opacity-100 transition-all hover:scale-110 active:scale-95 shrink-0"
                            title={`Delete ${w.profiles?.full_name || "entry"} from Hall of Flex`}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <h3 className="text-xl font-extrabold pr-2">{w.profiles?.full_name || "Winner"}</h3>
                      <p className="text-xs font-medium mt-2 leading-relaxed">&ldquo;{w.why_text}&rdquo;</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* PEOPLE & ACCESS: MANAGER ONLY (from public.profiles) */}
            {profile.is_manager && renderPeopleAndAccess(false)}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t-2 border-[var(--line)] py-12 mt-16 bg-[var(--vs)] text-center">
        <div className="wrap">
          <div className="text-3xl font-extrabold tracking-tight">Your leave? Not if. But when.</div>
          <p className="text-sm text-[var(--muted)] mt-2">
            Flowwies Enterprise HRMS · Built for Workfloww.ai
          </p>
        </div>
      </footer>

      {/* VIEW & EDIT MEMBER DETAILS MODAL (MANAGER ONLY) */}
      {viewingMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="flow-card max-w-2xl w-full bg-white border-2 border-[var(--ink)] shadow-[10px_10px_0_var(--hard)] relative animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="p-6 border-b-2 border-[var(--line)] bg-[var(--vs)] flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[var(--vt2)] border-2 border-[var(--ink)] shadow-[3px_3px_0_var(--hard)] flex items-center justify-center font-extrabold text-2xl text-[var(--ink)] flex-shrink-0">
                  {getInitials(viewingMember.full_name)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-2xl font-extrabold text-[var(--ink)]">
                      {viewingMember.full_name || "Team Member"}
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      viewingMember.is_active === false
                        ? "bg-gray-100 text-gray-600 border-gray-300"
                        : "bg-emerald-100 text-emerald-800 border-emerald-300"
                    }`}>
                      {viewingMember.is_active === false ? "Paused" : "Active Member"}
                    </span>
                    {isEditingMember && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                        Editing Mode
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-1 flex items-center gap-2 flex-wrap">
                    <span>{viewingMember.email}</span>
                    <span>•</span>
                    <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-[var(--line)] text-[var(--ink)]">
                      {viewingMember.emp_code || `FW-${viewingMember.id.slice(0, 4).toUpperCase()}`}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isEditingMember ? (
                  <button
                    type="button"
                    onClick={() => {
                      openMemberModal(viewingMember, true);
                    }}
                    className="flow-btn sm bg-[var(--vt2)] border-[var(--ink)] text-[var(--ink)] flex items-center gap-1.5 font-bold shadow-[2px_2px_0_var(--hard)] hover:scale-105 transition-transform"
                    title="Edit this employee's info"
                  >
                    <Pencil size={13} />
                    <span>Edit Info</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingMember(false)}
                    className="flow-btn sm bg-white border-[var(--ink)] text-[var(--muted)] hover:text-[var(--ink)] text-xs"
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setViewingMember(null);
                    setIsEditingMember(false);
                    setShowViewingAccNo(false);
                  }}
                  className="p-1.5 rounded-full hover:bg-white text-[var(--muted)] hover:text-[var(--ink)] transition-all border border-transparent hover:border-[var(--line)]"
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body: Either Edit Form or View Mode */}
            {isEditingMember ? (
              <form onSubmit={handleSaveMemberInfoByManager} className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
                {memberEditError && (
                  <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-700 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{memberEditError}</span>
                  </div>
                )}
                {memberEditSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-700 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    <span>{memberEditSuccess}</span>
                  </div>
                )}

                {/* Section 1: Work & Access */}
                <div className="flow-card p-4 bg-white space-y-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-[var(--ink)] border-b pb-2 border-[var(--line)]">
                    <Briefcase size={16} className="text-[var(--v)]" />
                    <span>Work & Organization Details</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={memberEditForm.full_name || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, full_name: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Work Email *</label>
                      <input
                        type="email"
                        required
                        value={memberEditForm.email || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, email: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Employee ID / Code</label>
                      <input
                        type="text"
                        placeholder="e.g. FW-001"
                        value={memberEditForm.emp_code || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, emp_code: e.target.value })}
                        className="flow-field font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Role</label>
                      <select
                        value={memberEditForm.role || "employee"}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, role: e.target.value, hrms_role: e.target.value })}
                        className="flow-field"
                      >
                        <option value="employee">Employee</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Reporting Manager</label>
                      <select
                        value={memberEditForm.manager_id || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, manager_id: e.target.value })}
                        className="flow-field"
                      >
                        <option value="">Leadership (Default)</option>
                        {teamMembers
                          .filter((x) => x.id !== viewingMember.id && (x.role === "manager" || x.hrms_role === "manager"))
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.full_name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Departments (Multi-Select)</label>
                      <div className="flex gap-2 pt-1">
                        {["Growth", "Tech"].map((dName) => {
                          const currentDepts = memberEditForm.departments || [];
                          const hasDept = currentDepts.includes(dName);
                          return (
                            <button
                              key={dName}
                              type="button"
                              onClick={() => {
                                const next = hasDept ? currentDepts.filter((x: string) => x !== dName) : [...currentDepts, dName];
                                setMemberEditForm({ ...memberEditForm, departments: next.length > 0 ? next : ["Tech"] });
                              }}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                hasDept
                                  ? "bg-[var(--vt2)] border-[var(--ink)] shadow-[1px_1px_0_var(--hard)] text-[var(--ink)]"
                                  : "bg-white text-[var(--muted)] border-dashed border-[var(--line2)] opacity-70 hover:opacity-100"
                              }`}
                            >
                              {hasDept ? `✓ ${dName}` : `+ ${dName}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">CRM Access</label>
                      <button
                        type="button"
                        onClick={() => setMemberEditForm({ ...memberEditForm, can_access_crm: !memberEditForm.can_access_crm })}
                        className={`flow-tag text-xs cursor-pointer py-1.5 transition-all w-full text-center ${
                          memberEditForm.can_access_crm
                            ? "bg-[var(--vt2)] border-[var(--ink)] shadow-[1px_1px_0_var(--hard)] text-[var(--ink)] font-bold"
                            : "bg-[var(--vs)] text-[var(--muted)] border border-transparent"
                        }`}
                      >
                        {memberEditForm.can_access_crm ? "CRM Access Enabled ↗" : "CRM Access Disabled ✕"}
                      </button>
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Account Status</label>
                      <button
                        type="button"
                        onClick={() => setMemberEditForm({ ...memberEditForm, is_active: !memberEditForm.is_active })}
                        className={`flow-btn sm text-xs w-full ${
                          memberEditForm.is_active
                            ? "bg-emerald-100 border-emerald-400 text-emerald-900"
                            : "bg-gray-200 border-gray-400 text-gray-700"
                        }`}
                      >
                        {memberEditForm.is_active ? "✓ Active Member" : "⏸ Paused (Inactive)"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section 2: Contact & Personal Details */}
                <div className="flow-card p-4 bg-white space-y-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-[var(--ink)] border-b pb-2 border-[var(--line)]">
                    <User size={16} className="text-[var(--v)]" />
                    <span>Personal & Contact Info (Manager Authorized)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Mobile Phone</label>
                      <input
                        type="tel"
                        placeholder="10-digit mobile number"
                        value={memberEditForm.phone || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, phone: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Personal Email</label>
                      <input
                        type="email"
                        placeholder="personal@gmail.com"
                        value={memberEditForm.personal_email || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, personal_email: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Date of Birth (DOB) 🎂</label>
                      <input
                        type="date"
                        value={memberEditForm.dob || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, dob: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Date Joined</label>
                      <input
                        type="date"
                        value={memberEditForm.date_joined || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, date_joined: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Residential Address</label>
                      <input
                        type="text"
                        placeholder="Street address / apartment"
                        value={memberEditForm.address || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, address: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">City</label>
                      <input
                        type="text"
                        placeholder="e.g. Bengaluru"
                        value={memberEditForm.city || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, city: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">State & Pin Code</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="State"
                          value={memberEditForm.state || ""}
                          onChange={(e) => setMemberEditForm({ ...memberEditForm, state: e.target.value })}
                          className="flow-field"
                        />
                        <input
                          type="text"
                          placeholder="Pin Code"
                          value={memberEditForm.pin_code || ""}
                          onChange={(e) => setMemberEditForm({ ...memberEditForm, pin_code: e.target.value })}
                          className="flow-field"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Emergency Contact Name</label>
                      <input
                        type="text"
                        placeholder="Relative / Friend Name"
                        value={memberEditForm.emergency_contact_name || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, emergency_contact_name: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Emergency Contact Phone</label>
                      <input
                        type="tel"
                        placeholder="Emergency Phone"
                        value={memberEditForm.emergency_contact_phone || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, emergency_contact_phone: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Bank & Reimbursements */}
                <div className="flow-card p-4 bg-white space-y-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-[var(--ink)] border-b pb-2 border-[var(--line)]">
                    <CreditCard size={16} className="text-[var(--v)]" />
                    <span>Bank & UPI Details (Reimbursements / Payroll)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Bank Name</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC Bank, ICICI Bank"
                        value={memberEditForm.bank_name || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, bank_name: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Account Holder Name</label>
                      <input
                        type="text"
                        placeholder="Name as in bank account"
                        value={memberEditForm.bank_account_holder || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, bank_account_holder: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Account Number</label>
                      <input
                        type="text"
                        placeholder="9 to 18 digits"
                        value={memberEditForm.bank_account_number || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, bank_account_number: e.target.value })}
                        className="flow-field font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">IFSC Code</label>
                      <input
                        type="text"
                        placeholder="HDFC0001234"
                        value={memberEditForm.ifsc_code || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, ifsc_code: e.target.value.toUpperCase() })}
                        className="flow-field font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">UPI ID</label>
                      <input
                        type="text"
                        placeholder="name@okhdfcbank"
                        value={memberEditForm.upi_id || ""}
                        onChange={(e) => setMemberEditForm({ ...memberEditForm, upi_id: e.target.value })}
                        className="flow-field"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingMember(false)}
                    className="flow-btn sm bg-white border-[var(--ink)] text-[var(--ink)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={memberEditSaving}
                    className="flow-btn sm pri bg-[var(--v)] text-white border-[var(--ink)] font-bold shadow-[2px_2px_0_var(--hard)]"
                  >
                    {memberEditSaving ? "Saving changes..." : "Save Member Details"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {/* Scrollable Body: View Mode */}
                <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm">
                  
                  {/* Badges Overview */}
                  <div className="flex flex-wrap gap-2.5">
                    <div className="px-3 py-1.5 rounded-xl border border-[var(--ink)] shadow-[2px_2px_0_var(--hard)] bg-[var(--vt2)] font-bold text-xs flex items-center gap-1.5">
                      <Shield size={14} />
                      Role: <span className="capitalize">{viewingMember.role || viewingMember.hrms_role || "Employee"}</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-xl border border-[var(--line2)] bg-white font-bold text-xs flex items-center gap-1.5">
                      <Building size={14} />
                      Departments: {((viewingMember.departments && viewingMember.departments.length > 0) ? viewingMember.departments : [viewingMember.department || "Tech"]).join(", ")}
                    </div>
                    <div className={`px-3 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 ${
                      viewingMember.can_access_crm
                        ? "bg-purple-100 border-purple-400 text-purple-900"
                        : "bg-gray-100 border-gray-300 text-gray-600"
                    }`}>
                      <Sparkles size={14} />
                      CRM Access: {viewingMember.can_access_crm ? "Enabled ↗" : "Disabled ✕"}
                    </div>
                  </div>

                  {/* 1. Work & Organization */}
                  <div className="flow-card p-4 bg-white space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-[var(--ink)] border-b pb-2 border-[var(--line)]">
                      <Briefcase size={16} className="text-[var(--v)]" />
                      <span>Work & Employment</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Employee Code</span>
                        <span className="font-bold font-mono text-[var(--ink)] mt-0.5 block">
                          {viewingMember.emp_code || `FW-${viewingMember.id.slice(0, 4).toUpperCase()}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Work Email</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block truncate">
                          {viewingMember.email}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Reports To</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block">
                          {teamMembers.find((t) => t.id === viewingMember.manager_id)?.full_name || "Leadership (Default)"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Date Joined</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block">
                          {viewingMember.date_joined || (viewingMember.created_at ? new Date(viewingMember.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Personal & Contact Information */}
                  <div className="flow-card p-4 bg-white space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-[var(--ink)] border-b pb-2 border-[var(--line)]">
                      <User size={16} className="text-[var(--v)]" />
                      <span>Personal & Contact Details</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Mobile Phone</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block">
                          {viewingMember.phone || <span className="text-[var(--muted)] italic">Not provided</span>}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Personal Email</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block truncate">
                          {viewingMember.personal_email || <span className="text-[var(--muted)] italic">Not provided</span>}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Date of Birth 🎂</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block">
                          {viewingMember.dob ? `🎂 ${viewingMember.dob}` : <span className="text-[var(--muted)] italic">Not provided</span>}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Residential Address</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block">
                          {[viewingMember.address, viewingMember.city, viewingMember.state, viewingMember.pin_code].filter(Boolean).join(", ") || <span className="text-[var(--muted)] italic">Not provided</span>}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Emergency Contact Name</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block">
                          {viewingMember.emergency_contact_name || <span className="text-[var(--muted)] italic">Not provided</span>}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Emergency Contact Phone</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block">
                          {viewingMember.emergency_contact_phone || <span className="text-[var(--muted)] italic">Not provided</span>}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Banking & Reimbursements Details */}
                  <div className="flow-card p-4 bg-white space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-[var(--ink)] border-b pb-2 border-[var(--line)]">
                      <CreditCard size={16} className="text-[var(--v)]" />
                      <span>Bank & UPI Details (Reimbursements / Payroll)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Account Holder Name</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block">
                          {viewingMember.bank_account_holder || <span className="text-[var(--muted)] italic">Not provided</span>}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Bank Name</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block">
                          {viewingMember.bank_name || <span className="text-[var(--muted)] italic">Not provided</span>}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">Bank Account Number</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono font-bold text-[var(--ink)]">
                            {viewingMember.bank_account_number
                              ? (showViewingAccNo ? viewingMember.bank_account_number : `•••• •••• ${viewingMember.bank_account_number.slice(-4)}`)
                              : <span className="text-[var(--muted)] italic font-sans font-normal">Not provided</span>}
                          </span>
                          {viewingMember.bank_account_number && (
                            <button
                              type="button"
                              onClick={() => setShowViewingAccNo(!showViewingAccNo)}
                              className="text-[var(--muted)] hover:text-[var(--ink)] p-0.5"
                              title={showViewingAccNo ? "Hide account number" : "Show account number"}
                            >
                              {showViewingAccNo ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-[var(--muted)] block font-semibold">IFSC Code</span>
                        <span className="font-bold font-mono text-[var(--ink)] mt-0.5 block">
                          {viewingMember.ifsc_code || <span className="text-[var(--muted)] italic font-sans font-normal">Not provided</span>}
                        </span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-[var(--muted)] block font-semibold">UPI ID</span>
                        <span className="font-bold text-[var(--ink)] mt-0.5 block">
                          {viewingMember.upi_id || <span className="text-[var(--muted)] italic">Not provided</span>}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4. Leave & Policy */}
                  <div className="flow-card p-4 bg-white space-y-3">
                    <div className="flex items-center justify-between border-b pb-2 border-[var(--line)]">
                      <div className="flex items-center gap-2 font-bold text-sm text-[var(--ink)]">
                        <Calendar size={16} className="text-[var(--v)]" />
                        <span>Leave Policy & Attendance</span>
                      </div>
                      <span className="text-xs bg-[var(--vt2)] px-2.5 py-0.5 rounded-full font-bold border border-[var(--ink)] shadow-[1px_1px_0_var(--hard)]">
                        2 Leaves / Month
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted)]">
                      📌 <b>Policy:</b> Entitled to 2 paid leaves per calendar month (auto-renews on the 1st) + Birthday Leave 🎂.
                    </p>
                    {(() => {
                      const memberLeaves = calendarLeaves.filter(
                        (l) => l.user_id === viewingMember.id || l.profiles?.full_name === viewingMember.full_name
                      );
                      if (memberLeaves.length === 0) {
                        return (
                          <p className="text-xs italic text-[var(--muted)] bg-[var(--vs)] p-2.5 rounded-xl border border-[var(--line)]">
                            No leave requests submitted for this month.
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-1.5 mt-2">
                          <span className="text-xs font-bold text-[var(--ink)]">Leaves this month:</span>
                          {memberLeaves.map((l) => (
                            <div key={l.id} className="p-2.5 rounded-xl bg-[var(--vs)] border border-[var(--line)] flex items-center justify-between text-xs">
                              <div>
                                <span className="font-bold">{l.leave_type || "Leave"}</span> ({l.start_date} to {l.end_date} · {l.days_count} day{l.days_count > 1 ? "s" : ""})
                                {l.reason && <p className="text-[var(--muted)] text-[11px] mt-0.5">{l.reason}</p>}
                              </div>
                              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                                l.status === "approved" ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                                l.status === "declined" ? "bg-red-100 text-red-800 border-red-300" :
                                "bg-amber-100 text-amber-800 border-amber-300"
                              }`}>
                                {l.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t-2 border-[var(--line)] bg-[var(--vs)] flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      openMemberModal(viewingMember, true);
                    }}
                    className="flow-btn sm bg-[var(--vt2)] border-[var(--ink)] text-[var(--ink)] flex items-center gap-1.5 font-bold shadow-[2px_2px_0_var(--hard)]"
                  >
                    <Pencil size={13} />
                    <span>Edit Employee Details</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewingMember(null);
                      setShowViewingAccNo(false);
                      setIsEditingMember(false);
                    }}
                    className="flow-btn sm bg-white border-[var(--ink)] text-[var(--ink)]"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ADD PERSON MODAL (MANAGER ONLY) */}
      {showAddPersonModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="flow-card max-w-lg w-full bg-white border-2 border-[var(--ink)] shadow-[8px_8px_0_var(--hard)] relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowAddPersonModal(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-[var(--vs)] transition-all text-[var(--muted)] hover:text-[var(--ink)]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-[var(--vt2)] flex items-center justify-center border border-[var(--ink)] shadow-[2px_2px_0_var(--hard)]">
                <UserPlus className="w-5 h-5 text-[var(--ink)]" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-[var(--ink)]">Add Team Member</h3>
                <p className="text-xs text-[var(--muted)]">Provision access, departments, role, and leave entitlement.</p>
              </div>
            </div>

            <form onSubmit={handleAddPerson} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aditi Sharma"
                  value={addPersonForm.full_name}
                  onChange={(e) => setAddPersonForm({ ...addPersonForm, full_name: e.target.value })}
                  className="flow-field w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Work Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@workfloww.ai"
                  value={addPersonForm.email}
                  onChange={(e) => setAddPersonForm({ ...addPersonForm, email: e.target.value })}
                  className="flow-field w-full"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                    Role (Strictly 2 Roles) *
                  </label>
                  <select
                    value={addPersonForm.role}
                    onChange={(e) => setAddPersonForm({ ...addPersonForm, role: e.target.value })}
                    className="flow-field w-full"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                    Reports To
                  </label>
                  <select
                    value={addPersonForm.manager_id}
                    onChange={(e) => setAddPersonForm({ ...addPersonForm, manager_id: e.target.value })}
                    className="flow-field w-full"
                  >
                    <option value="">Leadership (Default)</option>
                    {teamMembers
                      .filter((m) => (m.role === "manager" || m.hrms_role === "manager"))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1.5">
                  Department(s) * (Multi-Select Allowed)
                </label>
                <div className="flex gap-2">
                  {["Growth", "Tech"].map((dName) => {
                    const isSelected = addPersonForm.departments.includes(dName);
                    return (
                      <button
                        key={dName}
                        type="button"
                        onClick={() => {
                          const next = isSelected
                            ? addPersonForm.departments.filter((d) => d !== dName)
                            : [...addPersonForm.departments, dName];
                          setAddPersonForm({ ...addPersonForm, departments: next.length > 0 ? next : [dName] });
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                          isSelected
                            ? dName === "Growth"
                              ? "bg-[var(--vt2)] border-[var(--ink)] shadow-[2px_2px_0_var(--hard)] text-[var(--ink)]"
                              : "bg-[var(--bt)] border-[var(--ink)] shadow-[2px_2px_0_var(--hard)] text-[var(--ink)]"
                            : "bg-white text-[var(--muted)] border-dashed border-[var(--line2)] opacity-70 hover:opacity-100"
                        }`}
                      >
                        {isSelected ? `✓ ${dName}` : `+ ${dName}`}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[var(--muted)] mt-1.5">
                  Growth members get access to CRM. Tech-only members have CRM access blocked.
                </p>
              </div>

              <div className="pt-2 border-t border-[var(--line)]">
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Date of Birth 🎂 (Automatic Birthday Leave)
                </label>
                <input
                  type="date"
                  value={addPersonForm.dob}
                  onChange={(e) => setAddPersonForm({ ...addPersonForm, dob: e.target.value })}
                  className="flow-field w-full"
                />
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  On their birthday, this team member will automatically stay on official Birthday Leave on the company calendar!
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[var(--vt)]/30 border border-[var(--line2)] text-xs text-[var(--muted)] space-y-1.5">
                <p>✨ <b>Leave policy:</b> Exactly <b>2 leaves in a month</b> that automatically renews on the 1st of every month.</p>
                <p>🔑 <b>Default Credentials:</b> Default temporary password is <b><code>workfloww@2026</code></b>. An onboarding email with login details will be sent to their email, and they will be required to change their password on first login.</p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setShowAddPersonModal(false)}
                  className="flow-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingPerson}
                  className="flow-btn pri"
                >
                  {isAddingPerson ? "Adding..." : "Add Team Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD HOLIDAY MODAL (CALENDAR MANAGER ONLY) */}
      {showAddHolidayModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="flow-card max-w-md w-full bg-white border-2 border-[var(--ink)] shadow-[8px_8px_0_var(--hard)] relative animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setShowAddHolidayModal(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-[var(--vs)] transition-all text-[var(--muted)] hover:text-[var(--ink)]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-[var(--vt)] flex items-center justify-center border border-[var(--ink)] shadow-[2px_2px_0_var(--hard)] text-lg">
                🎉
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-[var(--ink)]">Add Company Holiday</h3>
                <p className="text-xs text-[var(--muted)]">Add an official holiday to the company calendar.</p>
              </div>
            </div>

            <form onSubmit={handleAddHoliday} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Holiday Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Diwali / Christmas / Independence Day"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  className="flow-field w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Holiday Date *
                </label>
                <input
                  type="date"
                  required
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="flow-field w-full"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setShowAddHolidayModal(false)}
                  className="flow-btn"
                >
                  Cancel
                </button>
                <button type="submit" className="flow-btn pri">
                  Add Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD HOLIDAY CALENDAR MODAL (CALENDAR MANAGER ONLY) */}
      {showUploadHolidayModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="flow-card max-w-lg w-full bg-white border-2 border-[var(--ink)] shadow-[8px_8px_0_var(--hard)] relative animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setShowUploadHolidayModal(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-[var(--vs)] transition-all text-[var(--muted)] hover:text-[var(--ink)]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-[var(--vt2)] flex items-center justify-center border border-[var(--ink)] shadow-[2px_2px_0_var(--hard)] text-lg">
                📅
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-[var(--ink)]">Upload Holiday Calendar</h3>
                <p className="text-xs text-[var(--muted)]">Upload a CSV or paste company holiday dates.</p>
              </div>
            </div>

            <form onSubmit={handleBulkUploadHolidays} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                    CSV / Text format (Date, Holiday Name)
                  </label>
                  <label className="text-[11px] font-bold text-[var(--v)] cursor-pointer hover:underline flex items-center gap-1">
                    <span>📁 Choose .csv file</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setBulkHolidayText((ev.target?.result as string) || "");
                          };
                          reader.readAsText(file);
                        }
                      }}
                    />
                  </label>
                </div>

                <textarea
                  rows={8}
                  value={bulkHolidayText}
                  onChange={(e) => setBulkHolidayText(e.target.value)}
                  placeholder={`2026-01-26, Republic Day\n2026-03-25, Holi\n2026-08-15, Independence Day\n2026-10-02, Gandhi Jayanti\n2026-11-08, Diwali\n2026-12-25, Christmas`}
                  className="flow-field w-full font-mono text-xs leading-relaxed"
                  required
                />
                <p className="text-[11px] text-[var(--muted)] mt-1">
                  Format: <code>YYYY-MM-DD, Holiday Name</code> (one per line). Birthdays are automatically added from team profiles!
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setShowUploadHolidayModal(false)}
                  className="flow-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingHolidays}
                  className="flow-btn pri"
                >
                  {isUploadingHolidays ? "Uploading..." : "Save Holidays"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FORCE CHANGE PASSWORD MODAL (FIRST LOGIN MANDATORY) */}
      {profile?.must_change_password && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="flow-card max-w-md w-full bg-white border-2 border-[var(--ink)] shadow-[10px_10px_0_var(--hard)] relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--vt2)] flex items-center justify-center border-2 border-[var(--ink)] shadow-[2px_2px_0_var(--hard)] text-2xl">
                🔒
              </div>
              <div>
                <h3 className="text-xl font-black text-[var(--ink)]">Set Your New Password</h3>
                <p className="text-xs text-[var(--muted)]">Mandatory security requirement on first login</p>
              </div>
            </div>

            <div className="p-3.5 mb-4 rounded-xl bg-[var(--vt)]/35 border border-[var(--line2)] text-xs text-[var(--ink)] leading-relaxed">
              👋 Hi <b>{profile.full_name}</b>, your account was initialized with the default temporary password (<code>workfloww@2026</code>). You must set a new private password before accessing Flowwies.
            </div>

            {changePwdError && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold">
                {changePwdError}
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  New Password * (Min 6 characters)
                </label>
                <div className="relative">
                  <input
                    type={showNewPwd ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Enter your new secret password"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    className="flow-field pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd(!showNewPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] p-1 focus:outline-none"
                    title={showNewPwd ? "Hide password" : "Show password"}
                  >
                    {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-1">
                  Confirm New Password *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPwd ? "text" : "password"}
                    required
                    minLength={6}
                    placeholder="Repeat new password"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    className="flow-field pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] p-1 focus:outline-none"
                    title={showConfirmPwd ? "Hide password" : "Show password"}
                  >
                    {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isChangingPwd}
                className="flow-btn pri w-full py-3 mt-3 shadow-[3px_3px_0_var(--hard)] disabled:opacity-50"
              >
                {isChangingPwd ? "Updating Password..." : "Save Password & Enter Flowwies →"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATION */}
      {showToast && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-[var(--vt2)] text-[var(--ink)] border-2 border-[var(--ink)] px-6 py-3 rounded-2xl font-bold shadow-[4px_4px_0_var(--hard)] animate-bounce">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
