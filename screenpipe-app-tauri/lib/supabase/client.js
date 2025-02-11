"use strict";
// create supabase client
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)("https://eshwntsgsputksqamckh.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzaHdudHNnc3B1dGtzcWFtY2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMwMDg5ODQsImV4cCI6MjA0ODU4NDk4NH0.t91Xc-BK_7hYpTxVIGNQRAolBVAZBs4POdcQXH8rLS4");
exports.default = supabase;
