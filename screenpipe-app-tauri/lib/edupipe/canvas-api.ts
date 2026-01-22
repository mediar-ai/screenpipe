// Canvas LMS API Integration Module
import {
  CanvasCourse,
  CanvasAssignment,
  CanvasFile,
  CanvasGrade,
  CanvasAnnouncement,
  CanvasConfig,
} from "./types";

export class CanvasAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = "CanvasAPIError";
  }
}

export class CanvasAPI {
  private baseUrl: string;
  private accessToken: string;
  private userId?: number;

  constructor(config: CanvasConfig) {
    if (!config.domain || !config.accessToken) {
      throw new CanvasAPIError("Canvas domain and access token are required");
    }
    this.baseUrl = `https://${config.domain}/api/v1`;
    this.accessToken = config.accessToken;
    this.userId = config.userId;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Canvas API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.errors?.[0]?.message || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new CanvasAPIError(errorMessage, response.status);
    }

    return response.json();
  }

  // Pagination helper
  private async requestPaginated<T>(endpoint: string): Promise<T[]> {
    const results: T[] = [];
    let url: string | null = `${this.baseUrl}${endpoint}`;

    while (url) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new CanvasAPIError(`Canvas API error: ${response.status}`, response.status);
      }

      const data = await response.json();
      results.push(...data);

      // Check for Link header for pagination
      const linkHeader = response.headers.get("Link");
      url = this.getNextPageUrl(linkHeader);
    }

    return results;
  }

  private getNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;

    const links = linkHeader.split(",");
    for (const link of links) {
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  // User endpoints
  async getCurrentUser(): Promise<{ id: number; name: string; email: string }> {
    return this.request("/users/self");
  }

  async verifyConnection(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      this.userId = user.id;
      return true;
    } catch {
      return false;
    }
  }

  // Course endpoints
  async getCourses(): Promise<CanvasCourse[]> {
    interface RawCourse {
      id: number;
      name: string;
      course_code: string;
      term?: { name: string };
      start_at?: string;
      end_at?: string;
      image_download_url?: string;
      syllabus_body?: string;
      workflow_state: string;
      enrollments?: Array<{ type: string }>;
    }

    const rawCourses = await this.requestPaginated<RawCourse>(
      "/courses?include[]=term&include[]=syllabus_body&include[]=total_scores&enrollment_state=active&per_page=100"
    );

    return rawCourses.map((course) => ({
      id: course.id,
      name: course.name,
      code: course.course_code,
      term: course.term?.name,
      startDate: course.start_at,
      endDate: course.end_at,
      enrollmentType: this.mapEnrollmentType(course.enrollments?.[0]?.type),
      imageUrl: course.image_download_url,
      syllabusBody: course.syllabus_body,
      isActive: course.workflow_state === "available",
      progress: 0,
    }));
  }

  async getCourse(courseId: number): Promise<CanvasCourse> {
    interface RawCourse {
      id: number;
      name: string;
      course_code: string;
      term?: { name: string };
      start_at?: string;
      end_at?: string;
      image_download_url?: string;
      syllabus_body?: string;
      workflow_state: string;
      enrollments?: Array<{ type: string }>;
    }

    const course = await this.request<RawCourse>(
      `/courses/${courseId}?include[]=term&include[]=syllabus_body&include[]=total_scores`
    );

    return {
      id: course.id,
      name: course.name,
      code: course.course_code,
      term: course.term?.name,
      startDate: course.start_at,
      endDate: course.end_at,
      enrollmentType: this.mapEnrollmentType(course.enrollments?.[0]?.type),
      imageUrl: course.image_download_url,
      syllabusBody: course.syllabus_body,
      isActive: course.workflow_state === "available",
      progress: 0,
    };
  }

  private mapEnrollmentType(type?: string): "student" | "teacher" | "observer" {
    switch (type) {
      case "TeacherEnrollment":
      case "TaEnrollment":
        return "teacher";
      case "ObserverEnrollment":
        return "observer";
      default:
        return "student";
    }
  }

  // Assignment endpoints
  async getAssignments(courseId: number): Promise<CanvasAssignment[]> {
    interface RawAssignment {
      id: number;
      name: string;
      description?: string;
      due_at?: string;
      unlock_at?: string;
      lock_at?: string;
      points_possible?: number;
      submission_types: string[];
      rubric?: Array<{
        id: string;
        description: string;
        points: number;
        ratings: Array<{
          description: string;
          points: number;
        }>;
      }>;
      html_url: string;
      submission?: {
        submitted_at?: string;
        workflow_state: string;
        score?: number;
        grade?: string;
        graded_at?: string;
        late: boolean;
        missing: boolean;
        submission_comments?: Array<{
          comment: string;
          author_name: string;
        }>;
      };
    }

    const rawAssignments = await this.requestPaginated<RawAssignment>(
      `/courses/${courseId}/assignments?include[]=submission&include[]=rubric_assessment&per_page=100`
    );

    return rawAssignments.map((assignment) => ({
      id: assignment.id,
      courseId,
      name: assignment.name,
      description: assignment.description,
      dueAt: assignment.due_at,
      unlockAt: assignment.unlock_at,
      lockAt: assignment.lock_at,
      pointsPossible: assignment.points_possible,
      submissionTypes: assignment.submission_types,
      rubric: assignment.rubric
        ? {
            id: assignment.id,
            criteria: assignment.rubric,
          }
        : undefined,
      submissionStatus: this.getSubmissionStatus(assignment.submission),
      score: assignment.submission?.score,
      grade: assignment.submission?.grade,
      gradedAt: assignment.submission?.graded_at,
      feedbackComment: assignment.submission?.submission_comments?.[0]?.comment,
      url: assignment.html_url,
    }));
  }

  async getUpcomingAssignments(days: number = 14): Promise<CanvasAssignment[]> {
    const courses = await this.getCourses();
    const allAssignments: CanvasAssignment[] = [];

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    for (const course of courses) {
      if (!course.isActive) continue;
      const assignments = await this.getAssignments(course.id);
      const upcoming = assignments.filter((a) => {
        if (!a.dueAt) return false;
        const dueDate = new Date(a.dueAt);
        return dueDate >= now && dueDate <= futureDate;
      });
      allAssignments.push(...upcoming);
    }

    return allAssignments.sort((a, b) => {
      if (!a.dueAt || !b.dueAt) return 0;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });
  }

  private getSubmissionStatus(
    submission?: { workflow_state: string; late: boolean; missing: boolean }
  ): "submitted" | "pending" | "missing" | "late" {
    if (!submission) return "pending";
    if (submission.missing) return "missing";
    if (submission.late) return "late";
    if (submission.workflow_state === "submitted" || submission.workflow_state === "graded") {
      return "submitted";
    }
    return "pending";
  }

  // Files endpoints
  async getCourseFiles(courseId: number): Promise<CanvasFile[]> {
    interface RawFile {
      id: number;
      display_name: string;
      filename: string;
      content_type: string;
      url: string;
      size: number;
      created_at: string;
      updated_at: string;
    }

    const rawFiles = await this.requestPaginated<RawFile>(
      `/courses/${courseId}/files?per_page=100`
    );

    return rawFiles.map((file) => ({
      id: file.id,
      courseId,
      displayName: file.display_name,
      filename: file.filename,
      contentType: file.content_type,
      url: file.url,
      size: file.size,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      indexed: false,
    }));
  }

  async getFileDownloadUrl(fileId: number): Promise<string> {
    interface FileResponse {
      url: string;
    }
    const file = await this.request<FileResponse>(`/files/${fileId}`);
    return file.url;
  }

  // Grades endpoints
  async getGrades(): Promise<CanvasGrade[]> {
    interface RawEnrollment {
      course_id: number;
      grades?: {
        current_score?: number;
        final_score?: number;
        current_grade?: string;
        final_grade?: string;
      };
    }

    const enrollments = await this.requestPaginated<RawEnrollment>(
      "/users/self/enrollments?include[]=grades&per_page=100"
    );

    const courses = await this.getCourses();
    const courseMap = new Map(courses.map((c) => [c.id, c.name]));

    return enrollments
      .filter((e) => e.grades)
      .map((enrollment) => ({
        courseId: enrollment.course_id,
        courseName: courseMap.get(enrollment.course_id) || "Unknown Course",
        currentScore: enrollment.grades?.current_score,
        finalScore: enrollment.grades?.final_score,
        currentGrade: enrollment.grades?.current_grade,
        finalGrade: enrollment.grades?.final_grade,
      }));
  }

  // Announcements endpoints
  async getAnnouncements(courseIds: number[], days: number = 14): Promise<CanvasAnnouncement[]> {
    interface RawAnnouncement {
      id: number;
      context_code: string;
      title: string;
      message: string;
      posted_at: string;
      author: { display_name: string };
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const contextCodes = courseIds.map((id) => `course_${id}`).join("&context_codes[]=");
    const rawAnnouncements = await this.requestPaginated<RawAnnouncement>(
      `/announcements?context_codes[]=${contextCodes}&start_date=${startDate.toISOString()}&per_page=100`
    );

    return rawAnnouncements.map((announcement) => ({
      id: announcement.id,
      courseId: parseInt(announcement.context_code.replace("course_", "")),
      title: announcement.title,
      message: announcement.message,
      postedAt: announcement.posted_at,
      author: announcement.author.display_name,
    }));
  }

  // Calendar/Events endpoints
  async getCalendarEvents(startDate: Date, endDate: Date) {
    interface RawEvent {
      id: number;
      title: string;
      description?: string;
      start_at: string;
      end_at?: string;
      context_code: string;
      type: string;
      assignment?: {
        id: number;
        due_at: string;
      };
    }

    const events = await this.requestPaginated<RawEvent>(
      `/calendar_events?start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}&per_page=100`
    );

    return events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      startAt: event.start_at,
      endAt: event.end_at,
      courseId: event.context_code?.startsWith("course_")
        ? parseInt(event.context_code.replace("course_", ""))
        : undefined,
      type: event.type,
      assignmentId: event.assignment?.id,
      assignmentDueAt: event.assignment?.due_at,
    }));
  }

  // Modules endpoints (for course structure)
  async getModules(courseId: number) {
    interface RawModule {
      id: number;
      name: string;
      position: number;
      state: string;
      items_count: number;
      items?: Array<{
        id: number;
        title: string;
        type: string;
        content_id?: number;
        html_url?: string;
        completion_requirement?: {
          type: string;
          completed: boolean;
        };
      }>;
    }

    const modules = await this.requestPaginated<RawModule>(
      `/courses/${courseId}/modules?include[]=items&per_page=100`
    );

    return modules.map((module) => ({
      id: module.id,
      name: module.name,
      position: module.position,
      state: module.state,
      itemsCount: module.items_count,
      items: module.items?.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        contentId: item.content_id,
        url: item.html_url,
        completed: item.completion_requirement?.completed ?? false,
      })),
    }));
  }

  // Discussion topics
  async getDiscussions(courseId: number) {
    interface RawDiscussion {
      id: number;
      title: string;
      message: string;
      posted_at: string;
      author: { display_name: string };
      discussion_subentry_count: number;
      html_url: string;
    }

    const discussions = await this.requestPaginated<RawDiscussion>(
      `/courses/${courseId}/discussion_topics?per_page=100`
    );

    return discussions.map((discussion) => ({
      id: discussion.id,
      title: discussion.title,
      message: discussion.message,
      postedAt: discussion.posted_at,
      author: discussion.author.display_name,
      replyCount: discussion.discussion_subentry_count,
      url: discussion.html_url,
    }));
  }
}

// Helper function to create Canvas API instance from config
export function createCanvasAPI(config: CanvasConfig): CanvasAPI | null {
  if (!config.connected || !config.domain || !config.accessToken) {
    return null;
  }
  return new CanvasAPI(config);
}

// OAuth2 URL generators for Canvas
export function getCanvasOAuthUrl(domain: string, clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "url:GET|/api/v1/users/:user_id/profile url:GET|/api/v1/courses url:GET|/api/v1/courses/:course_id/assignments url:GET|/api/v1/courses/:course_id/files url:GET|/api/v1/users/:user_id/enrollments",
    state: crypto.randomUUID(),
  });
  return `https://${domain}/login/oauth2/auth?${params.toString()}`;
}

export async function exchangeCanvasOAuthCode(
  domain: string,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const response = await fetch(`https://${domain}/login/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new CanvasAPIError("Failed to exchange OAuth code", response.status);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}
