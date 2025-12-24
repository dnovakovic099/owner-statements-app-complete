import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Check, Calendar, Clock, Send, Trash2, ChevronDown, ChevronUp, History, RefreshCw, CheckCircle, XCircle, AlertCircle, FileText, Plus, Edit2, Eye, Star, Copy, Megaphone, X, Users, Image, Link2 } from 'lucide-react';
import { listingsAPI, statementsAPI, emailAPI, EmailLog, EmailStats, emailTemplatesAPI, EmailTemplate, EmailTemplateVariable } from '../services/api';
import { Listing, Statement } from '../types';
import { useToast } from './ui/toast';

interface EmailDashboardProps {
  onBack: () => void;
}

interface ScheduledBatch {
  id: string;
  tags: string[];
  listingIds: number[];
  listingsToGenerate: number;
  scheduledDate: string;
  scheduledTime: string;
  periodStart: string;
  periodEnd: string;
  calculationType: 'checkout' | 'calendar';
  testEmail?: string;
  testSendAll?: boolean; // true = send all to test email, false = send just one
  createdAt: Date;
}

// Default period configurations based on tag prefix
const getDefaultDaysForTag = (tag: string): number => {
  const upperTag = tag.toUpperCase();
  if (upperTag.includes('WEEKLY') && !upperTag.includes('BI')) return 7;
  if (upperTag.includes('BI-WEEKLY') || upperTag.includes('BIWEEKLY')) return 14;
  if (upperTag.includes('MONTHLY')) return 30;
  return 14; // Default to 14 days
};

const EmailDashboard: React.FC<EmailDashboardProps> = ({ onBack }) => {
  const { showToast } = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  // Schedule state
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');

  // Custom period state
  const [useCustomPeriod, setUseCustomPeriod] = useState(false);
  const [customPeriodStart, setCustomPeriodStart] = useState('');
  const [customPeriodEnd, setCustomPeriodEnd] = useState('');
  // Type is now automatically determined by tag (MONTHLY=calendar, WEEKLY/BI-WEEKLY=checkout)

  // Pending scheduled batches
  const [pendingBatches, setPendingBatches] = useState<ScheduledBatch[]>([]);

  // Sending state
  const [sendingBatchId, setSendingBatchId] = useState<string | null>(null);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number; status: string } | null>(null);

  // Test email state
  const [testEmail, setTestEmail] = useState('');
  const [testSendAll, setTestSendAll] = useState(false); // false = send just one, true = send all

  // Email history state
  const [showHistory, setShowHistory] = useState(false);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed' | 'pending'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateStart, setHistoryDateStart] = useState('');
  const [historyDateEnd, setHistoryDateEnd] = useState('');

  // Email templates state
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateVariables, setTemplateVariables] = useState<EmailTemplateVariable[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<{ subject: string; htmlBody: string } | null>(null);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    frequencyType: 'custom' as 'weekly' | 'bi-weekly' | 'monthly' | 'custom',
    tags: [] as string[],
    subject: '',
    htmlBody: '',
    textBody: '',
    description: '',
    isDefault: false
  });

  // Announcement state
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementSubject, setAnnouncementSubject] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementSendToAll, setAnnouncementSendToAll] = useState(true);
  const [announcementTags, setAnnouncementTags] = useState<Set<string>>(new Set());
  const [announcementSending, setAnnouncementSending] = useState(false);
  const [announcementTestSending, setAnnouncementTestSending] = useState(false);
  const [announcementRecipientCount, setAnnouncementRecipientCount] = useState(0);
  const [announcementTestEmail, setAnnouncementTestEmail] = useState('');
  const [showAnnouncementPreview, setShowAnnouncementPreview] = useState(false);
  const [announcementImages, setAnnouncementImages] = useState<Map<string, string>>(new Map());
  const [announcementCursorPos, setAnnouncementCursorPos] = useState(0);
  const [announcementRateLimit, setAnnouncementRateLimit] = useState(1000); // 1 second delay
  const [announcementRetryFailed, setAnnouncementRetryFailed] = useState(false);

  // Track cursor position in body textarea
  const handleBodyCursorChange = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setAnnouncementCursorPos(target.selectionStart || 0);
  };

  // Fetch email history
  const fetchEmailHistory = async () => {
    setHistoryLoading(true);
    try {
      const [logsRes, statsRes] = await Promise.all([
        emailAPI.getEmailLogs({
          limit: 100,
          status: historyFilter === 'all' ? undefined : historyFilter
        }),
        emailAPI.getEmailStats()
      ]);
      setEmailLogs(logsRes.logs || []);
      setEmailStats(statsRes);
    } catch (error) {
      console.error('Failed to fetch email history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Fetch history when filter changes or when opened
  useEffect(() => {
    if (showHistory) {
      fetchEmailHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory, historyFilter]);

  // Fetch email templates
  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await emailTemplatesAPI.getTemplates();
      setTemplates(res.templates || []);
      setTemplateVariables(res.variables || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setTemplatesLoading(false);
    }
  };

  // Fetch templates on mount (for count) and when opened
  useEffect(() => {
    fetchTemplates();
  }, []);

  // Fetch announcement recipient count
  const fetchAnnouncementRecipientCount = async () => {
    try {
      const tags = announcementSendToAll ? [] : Array.from(announcementTags);
      const result = await emailAPI.getOwners(tags);
      setAnnouncementRecipientCount(result.count);
    } catch (error) {
      console.error('Failed to fetch recipient count:', error);
      setAnnouncementRecipientCount(0);
    }
  };

  // Update recipient count when announcement options change
  useEffect(() => {
    if (showAnnouncementModal) {
      fetchAnnouncementRecipientCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAnnouncementModal, announcementSendToAll, announcementTags]);

  // Send announcement
  const handleSendAnnouncement = async (isTest: boolean = false) => {
    if (!announcementSubject.trim() || !announcementBody.trim()) {
      showToast('Please enter subject and message', 'error');
      return;
    }

    if (isTest && !announcementTestEmail.trim()) {
      showToast('Please enter a test email address', 'error');
      return;
    }

    if (!isTest && announcementRecipientCount === 0) {
      showToast('No recipients found', 'error');
      return;
    }

    // Use separate loading states for test vs main send
    if (isTest) {
      setAnnouncementTestSending(true);
    } else {
      setAnnouncementSending(true);
    }

    try {
      // Replace image placeholders with actual base64 images before sending
      const bodyWithImages = replaceImagePlaceholders(announcementBody);

      const result = await emailAPI.sendAnnouncement({
        subject: announcementSubject,
        body: bodyWithImages,
        sendToAll: announcementSendToAll,
        tags: announcementSendToAll ? undefined : Array.from(announcementTags),
        testEmail: isTest ? announcementTestEmail : undefined,
        delayMs: isTest ? 0 : announcementRateLimit,
        retryFailedOnly: isTest ? false : announcementRetryFailed
      });

      if (result.success) {
        if (isTest) {
          showToast(`Test announcement sent to ${announcementTestEmail}`, 'success');
        } else {
          showToast(`Announcement sent to ${result.sent} recipients${result.failed > 0 ? `, ${result.failed} failed` : ''}`, 'success');
          setShowAnnouncementModal(false);
          setAnnouncementSubject('');
          setAnnouncementBody('');
          setAnnouncementSendToAll(true);
          setAnnouncementTags(new Set());
          setAnnouncementTestEmail('');
          setShowAnnouncementPreview(false);
          setAnnouncementImages(new Map());
          setAnnouncementRetryFailed(false);
        }
      } else {
        showToast('Failed to send announcement', 'error');
      }
    } catch (error: any) {
      showToast(error?.response?.data?.error || 'Failed to send announcement', 'error');
    } finally {
      if (isTest) {
        setAnnouncementTestSending(false);
      } else {
        setAnnouncementSending(false);
      }
    }
  };

  // Toggle announcement tag
  const toggleAnnouncementTag = (tag: string) => {
    const newTags = new Set(announcementTags);
    if (newTags.has(tag)) {
      newTags.delete(tag);
    } else {
      newTags.add(tag);
    }
    setAnnouncementTags(newTags);
  };

  // Replace image placeholders with actual images
  const replaceImagePlaceholders = (text: string): string => {
    let result = text;
    announcementImages.forEach((base64, id) => {
      result = result.replace(
        new RegExp(`\\[IMAGE:${id}\\]`, 'g'),
        `<img src="${base64}" style="max-width:100%;" />`
      );
    });
    return result;
  };

  // Handle template save
  const handleSaveTemplate = async () => {
    try {
      if (editingTemplate) {
        // Update existing
        await emailTemplatesAPI.updateTemplate(editingTemplate.id, {
          name: newTemplate.name,
          frequencyType: newTemplate.frequencyType,
          tags: newTemplate.tags,
          subject: newTemplate.subject,
          htmlBody: newTemplate.htmlBody,
          textBody: newTemplate.textBody,
          description: newTemplate.description,
          isDefault: newTemplate.isDefault
        });
        showToast('Template updated successfully', 'success');
      } else {
        // Create new
        await emailTemplatesAPI.createTemplate({
          name: newTemplate.name,
          frequencyType: newTemplate.frequencyType,
          tags: newTemplate.tags,
          subject: newTemplate.subject,
          htmlBody: newTemplate.htmlBody,
          textBody: newTemplate.textBody,
          description: newTemplate.description,
          isDefault: newTemplate.isDefault
        });
        showToast('Template created successfully', 'success');
      }
      setShowTemplateEditor(false);
      setEditingTemplate(null);
      setNewTemplate({ name: '', frequencyType: 'custom', tags: [], subject: '', htmlBody: '', textBody: '', description: '', isDefault: false });
      fetchTemplates();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to save template', 'error');
    }
  };

  // Handle template delete
  const handleDeleteTemplate = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      await emailTemplatesAPI.deleteTemplate(id);
      showToast('Template deleted', 'success');
      fetchTemplates();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to delete template', 'error');
    }
  };

  // Handle set default
  const handleSetDefault = async (id: number) => {
    try {
      await emailTemplatesAPI.setDefault(id);
      showToast('Template set as default', 'success');
      fetchTemplates();
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to set default', 'error');
    }
  };

  // Preview template
  const handlePreviewTemplate = async () => {
    try {
      const preview = await emailTemplatesAPI.previewTemplate({
        subject: newTemplate.subject,
        htmlBody: newTemplate.htmlBody,
        textBody: newTemplate.textBody
      });
      setTemplatePreview({ subject: preview.subject, htmlBody: preview.htmlBody });
    } catch (error) {
      showToast('Failed to preview template', 'error');
    }
  };

  // Open template editor
  const openTemplateEditor = (template?: EmailTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setNewTemplate({
        name: template.name,
        frequencyType: template.frequencyType,
        tags: template.tags || [],
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody || '',
        description: template.description || '',
        isDefault: template.isDefault || false
      });
    } else {
      setEditingTemplate(null);
      setNewTemplate({ name: '', frequencyType: 'custom', tags: [], subject: '', htmlBody: '', textBody: '', description: '', isDefault: false });
    }
    setTemplatePreview(null);
    setShowTemplateEditor(true);
  };

  // Insert variable at cursor
  const insertVariable = (varName: string) => {
    const variable = `{{${varName}}}`;
    setNewTemplate(prev => ({
      ...prev,
      htmlBody: prev.htmlBody + variable
    }));
  };

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [listingsRes, statementsRes, statsRes] = await Promise.all([
          listingsAPI.getListings(),
          statementsAPI.getStatements({ status: 'draft', limit: 500 }),
          emailAPI.getEmailStats()
        ]);
        setListings(listingsRes.listings || []);
        setStatements(statementsRes.statements || []);
        setEmailStats(statsRes);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Extract unique tags from listings
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    listings.forEach(listing => {
      listing.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [listings]);

  // Get listings for selected tags
  const selectedListings = useMemo(() => {
    if (selectedTags.size === 0) return [];
    return listings.filter(l => l.tags?.some(t => selectedTags.has(t)));
  }, [listings, selectedTags]);

  // Get listings with and without statements
  const { listingsWithStatements, listingsWithoutStatements } = useMemo(() => {
    const statementPropertyIds = new Set(statements.map(s => s.propertyId));
    const withStatements = selectedListings.filter(l => statementPropertyIds.has(l.id));
    const withoutStatements = selectedListings.filter(l => !statementPropertyIds.has(l.id));
    return { listingsWithStatements: withStatements, listingsWithoutStatements: withoutStatements };
  }, [selectedListings, statements]);


  // Toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  // Select all tags
  const selectAllTags = () => {
    setSelectedTags(new Set(availableTags));
  };

  // Clear all tags
  const clearAllTags = () => {
    setSelectedTags(new Set());
  };

  // Calculate period dates based on config
  const calculatePeriodDates = (days: number): { start: string; end: string } => {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() - 1); // Yesterday as end date
    const start = new Date(end);
    start.setDate(start.getDate() - days + 1);

    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };

  // Get calculation type based on tag name
  const getCalculationTypeForTag = (tag: string): 'checkout' | 'calendar' => {
    const upperTag = tag.toUpperCase();
    // MONTHLY tags use calendar-based statements
    if (upperTag.includes('MONTHLY')) return 'calendar';
    // WEEKLY and BI-WEEKLY tags use checkout-based statements
    return 'checkout';
  };

  // Get calculated period for selected tags
  const calculatedPeriod = useMemo(() => {
    if (selectedTags.size === 0) return null;

    // Get the first tag's default days and calculation type based on tag name
    const firstTag = Array.from(selectedTags)[0];
    const days = getDefaultDaysForTag(firstTag);
    const calculationType = getCalculationTypeForTag(firstTag);

    const { start, end } = calculatePeriodDates(days);
    return { start, end, calculationType, days };
  }, [selectedTags]);

  // Filter email logs based on search and date
  const filteredEmailLogs = useMemo(() => {
    let filtered = emailLogs;

    // Filter by search term
    if (historySearch) {
      const searchLower = historySearch.toLowerCase();
      filtered = filtered.filter(log =>
        log.propertyName?.toLowerCase().includes(searchLower) ||
        log.recipientEmail?.toLowerCase().includes(searchLower) ||
        log.recipientName?.toLowerCase().includes(searchLower) ||
        log.frequencyTag?.toLowerCase().includes(searchLower)
      );
    }

    // Filter by date range
    if (historyDateStart) {
      const startDate = new Date(historyDateStart);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(log => {
        const logDate = new Date(log.createdAt || log.sentAt || '');
        return logDate >= startDate;
      });
    }

    if (historyDateEnd) {
      const endDate = new Date(historyDateEnd);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(log => {
        const logDate = new Date(log.createdAt || log.sentAt || '');
        return logDate <= endDate;
      });
    }

    return filtered;
  }, [emailLogs, historySearch, historyDateStart, historyDateEnd]);

  // Handle schedule emails - adds to pending queue
  const handleScheduleEmails = () => {
    if (!scheduledDate) {
      showToast('Please select a date', 'error');
      return;
    }
    if (selectedListings.length === 0) {
      showToast('No listings selected', 'error');
      return;
    }

    // Determine period dates and calculation type (type is always based on tag)
    let periodStart: string;
    let periodEnd: string;
    let calcType: 'checkout' | 'calendar';

    if (!calculatedPeriod) {
      showToast('Could not determine statement period. Please select a tag.', 'error');
      return;
    }

    // Type is always determined by the tag
    calcType = calculatedPeriod.calculationType;

    if (useCustomPeriod && customPeriodStart && customPeriodEnd) {
      periodStart = customPeriodStart;
      periodEnd = customPeriodEnd;
    } else {
      periodStart = calculatedPeriod.start;
      periodEnd = calculatedPeriod.end;
    }

    const newBatch: ScheduledBatch = {
      id: `batch-${Date.now()}`,
      tags: Array.from(selectedTags),
      listingIds: selectedListings.map(l => l.id),
      listingsToGenerate: listingsWithoutStatements.length,
      scheduledDate,
      scheduledTime,
      periodStart,
      periodEnd,
      calculationType: calcType,
      testEmail: testEmail || undefined,
      testSendAll: testEmail ? testSendAll : undefined,
      createdAt: new Date(),
    };

    setPendingBatches(prev => [...prev, newBatch]);

    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    const formattedDate = scheduledDateTime.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const formattedTime = scheduledDateTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    showToast(`Added ${selectedListings.length} listings to pending queue for ${formattedDate} at ${formattedTime}`, 'success');

    // Reset selection
    setSelectedTags(new Set());
    setScheduledDate('');
    setScheduledTime('09:00');
    setUseCustomPeriod(false);
    setCustomPeriodStart('');
    setCustomPeriodEnd('');
  };

  // Remove a pending batch
  const removeBatch = (batchId: string) => {
    setPendingBatches(prev => prev.filter(b => b.id !== batchId));
    showToast('Scheduled batch removed', 'success');
  };

  // Send test email immediately (without adding to queue)
  const handleSendTestNow = async () => {
    if (!testEmail || !calculatedPeriod) return;

    // Create a temporary batch for immediate sending
    const tempBatch: ScheduledBatch = {
      id: `temp-${Date.now()}`,
      tags: Array.from(selectedTags),
      listingIds: selectedListings.map(l => l.id),
      listingsToGenerate: listingsWithoutStatements.length,
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTime: new Date().toTimeString().slice(0, 5),
      periodStart: useCustomPeriod && customPeriodStart ? customPeriodStart : calculatedPeriod.start,
      periodEnd: useCustomPeriod && customPeriodEnd ? customPeriodEnd : calculatedPeriod.end,
      calculationType: calculatedPeriod.calculationType, // Always based on tag
      testEmail: testEmail,
      testSendAll: testSendAll,
      createdAt: new Date(),
    };

    // Send immediately with the batch directly
    await executeBatchSend(tempBatch, false);
  };

  // Send a batch immediately (from pending queue)
  const handleSendBatchNow = async (batchId: string) => {
    const batch = pendingBatches.find(b => b.id === batchId);
    if (!batch) return;
    await executeBatchSend(batch, true);
  };

  // Execute batch send logic
  const executeBatchSend = async (batch: ScheduledBatch, removeFromQueue: boolean) => {
    if (!batch) return;

    setSendingBatchId(batch.id);
    setSendProgress({ current: 0, total: batch.listingIds.length, status: 'Starting...' });

    try {
      // Build a map of existing statements by propertyId
      const statementMap = new Map<number, Statement>();
      statements.forEach(s => {
        if (s.propertyId) {
          statementMap.set(s.propertyId, s);
        }
      });

      // Step 1 & 2: Process each listing - generate statement if needed, then send email
      const isTestSingleEmail = batch.testEmail && !batch.testSendAll;

      let sent = 0;
      let failed = 0;
      let skipped = 0;
      let generated = 0;
      let testEmailSent = false;

      for (let i = 0; i < batch.listingIds.length; i++) {
        // If test mode with single email and we already sent one, skip the rest
        if (isTestSingleEmail && testEmailSent) {
          skipped++;
          continue;
        }

        const listingId = batch.listingIds[i];
        const listing = listings.find(l => l.id === listingId);

        if (!listing) {
          console.warn(`Listing ${listingId} not found`);
          skipped++;
          setSendProgress({
            current: i + 1,
            total: batch.listingIds.length,
            status: `Sent ${sent}, Skipped ${skipped}, Failed ${failed}`
          });
          continue;
        }

        if (!listing.ownerEmail) {
          console.warn(`Listing ${listingId} (${listing.name}) has no owner email`);
          if (!isTestSingleEmail) {
            skipped++;
            setSendProgress({
              current: i + 1,
              total: batch.listingIds.length,
              status: `Sent ${sent}, Skipped ${skipped} (no email), Failed ${failed}`
            });
          }
          continue;
        }

        // Check if statement exists for this listing
        let statement = statementMap.get(listingId);

        // If no statement, try to generate one
        if (!statement) {
          setSendProgress({
            current: i + 1,
            total: batch.listingIds.length,
            status: `Generating statement for ${listing.name}...`
          });

          try {
            console.log(`Generating statement for listing ${listingId} (${listing.name})...`);
            const result = await statementsAPI.generateStatement({
              ownerId: '0', // Let backend figure out owner from property
              propertyId: listingId.toString(),
              startDate: batch.periodStart,
              endDate: batch.periodEnd,
              calculationType: batch.calculationType,
            });
            console.log(`Statement generation result for ${listing.name}:`, result);

            // Fetch the newly created statement
            await new Promise(resolve => setTimeout(resolve, 500));
            const statementsRes = await statementsAPI.getStatements({
              propertyId: listingId.toString(),
              startDate: batch.periodStart,
              endDate: batch.periodEnd,
              limit: 10
            });

            if (statementsRes.statements && statementsRes.statements.length > 0) {
              statement = statementsRes.statements[0];
              statementMap.set(listingId, statement);
              generated++;
              console.log(`Found generated statement ${statement.id} for ${listing.name}`);
            } else {
              console.warn(`No statement found after generation for ${listing.name}`);
            }
          } catch (error: any) {
            console.error(`Failed to generate statement for ${listing.name}:`, error);
          }
        }

        if (statement) {
          try {
            // Use batch's test email if provided, otherwise use owner's email
            const recipientEmail = batch.testEmail || listing.ownerEmail;

            // Find the tag for this listing that matches one of the batch tags
            const listingTag = listing.tags?.find(t => batch.tags.includes(t)) || batch.tags[0] || 'manual';

            setSendProgress({
              current: i + 1,
              total: batch.listingIds.length,
              status: `Sending to ${listing.name}...`
            });

            console.log(`[${batch.testEmail ? 'TEST' : 'LIVE'}] Sending email to ${recipientEmail}:`, {
              statementId: statement.id,
              listingName: listing.name,
              originalOwnerEmail: listing.ownerEmail,
              tag: listingTag
            });

            // Template is auto-selected based on statement's calculation type
            await emailAPI.sendStatementEmail(
              statement.id,
              recipientEmail,
              listingTag
            );
            sent++;
            if (isTestSingleEmail) {
              testEmailSent = true;
            }
          } catch (error: any) {
            console.error(`Failed to send email for listing ${listingId}:`, error);
            failed++;
          }
        } else {
          // No statement found and couldn't generate one
          console.warn(`No statement for listing ${listingId} (${listing.name}) - skipping`);
          if (!isTestSingleEmail) {
            skipped++;
          }
        }

        if (!isTestSingleEmail) {
          const statusParts = [`Sent ${sent}`];
          if (generated > 0) statusParts.push(`Generated ${generated}`);
          if (skipped > 0) statusParts.push(`Skipped ${skipped}`);
          if (failed > 0) statusParts.push(`Failed ${failed}`);

          setSendProgress({
            current: i + 1,
            total: batch.listingIds.length,
            status: statusParts.join(', ')
          });

          // Small delay between emails to avoid overwhelming the server
          if (i < batch.listingIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }

      // Calculate skipped for test single email mode
      if (isTestSingleEmail && sent > 0) {
        skipped = batch.listingIds.length - 1;
      }

      // Build result message
      let resultMessage: string;
      if (isTestSingleEmail) {
        resultMessage = sent > 0
          ? `Test email sent to ${batch.testEmail}${generated > 0 ? ` (${generated} statement generated)` : ''}`
          : `Failed to send test email`;
      } else {
        const parts = [`${sent} sent`];
        if (generated > 0) parts.push(`${generated} generated`);
        if (skipped > 0) parts.push(`${skipped} skipped`);
        if (failed > 0) parts.push(`${failed} failed`);
        resultMessage = `Completed: ${parts.join(', ')}`;
      }
      showToast(resultMessage, sent > 0 ? 'success' : 'error');

      // Remove batch from pending if it was from the queue
      if (removeFromQueue) {
        setPendingBatches(prev => prev.filter(b => b.id !== batch.id));
      }

    } catch (error: any) {
      console.error('Failed to send batch:', error);
      showToast(`Failed to send emails: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setSendingBatchId(null);
      setSendProgress(null);
    }
  };

  // Format date for display
  const formatScheduledDate = (date: string, time: string) => {
    const dateTime = new Date(`${date}T${time}`);
    return {
      date: dateTime.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      time: dateTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Email Dashboard</h1>
              <p className="text-sm text-gray-500">Manage email automation</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Global Progress Bar - Shows during any send operation */}
        {sendingBatchId && sendProgress && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <div>
                <p className="font-medium text-blue-800">
                  {sendingBatchId.startsWith('temp-') ? 'Sending Test Email...' : 'Sending Emails...'}
                </p>
                <p className="text-sm text-blue-600">{sendProgress.status}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-blue-700">Progress</span>
              <span className="text-sm font-medium text-blue-800">
                {sendProgress.current}/{sendProgress.total} ({Math.round((sendProgress.current / sendProgress.total) * 100)}%)
              </span>
            </div>
            <div className="w-full h-3 bg-blue-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300 ease-out"
                style={{ width: `${Math.round((sendProgress.current / sendProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Tag Selection */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Select Tags</h2>
              <p className="text-sm text-gray-500">Choose which property groups to include</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllTags}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Select All
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={clearAllTags}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                Clear
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : availableTags.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No tags found. Add tags to your listings first.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableTags.map(tag => {
                const isSelected = selectedTags.has(tag);
                // Count listings with this tag
                const listingsWithTag = listings.filter(l => l.tags?.includes(tag)).length;

                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 bg-white'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="font-medium">{tag}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      isSelected
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {listingsWithTag}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selectedTags.size > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{selectedTags.size}</span> tag{selectedTags.size !== 1 ? 's' : ''} selected
                {' · '}
                <span className="font-medium text-gray-900">{selectedListings.length}</span> properties
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-green-600">
                  <span className="font-medium">{listingsWithStatements.length}</span> with statements
                </span>
                {listingsWithoutStatements.length > 0 && (
                  <span className="text-amber-600">
                    <span className="font-medium">{listingsWithoutStatements.length}</span> need generation
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Schedule Section - Only show when tags are selected */}
        {selectedTags.size > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Schedule Emails</h2>
                <p className="text-sm text-gray-500">
                  {listingsWithoutStatements.length > 0
                    ? `Will generate ${listingsWithoutStatements.length} statements and queue ${selectedListings.length} emails`
                    : `Add ${selectedListings.length} email${selectedListings.length !== 1 ? 's' : ''} to pending queue`
                  }
                </p>
              </div>
            </div>

            {listingsWithoutStatements.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  <span className="font-medium">{listingsWithoutStatements.length} listing{listingsWithoutStatements.length !== 1 ? 's' : ''}</span> don't have statements yet.
                  They will be generated automatically when you send.
                </p>
              </div>
            )}

            {/* Test Email Field */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Test Email <span className="text-gray-400 font-normal">(optional - leave empty to send to actual owners)</span>
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Enter test email to receive emails instead of owners"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              {testEmail && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-yellow-800">Send to test email:</span>
                      <div className="flex items-center gap-2 bg-white rounded-lg border border-yellow-300 p-1">
                        <button
                          onClick={() => setTestSendAll(false)}
                          disabled={sendingBatchId !== null}
                          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                            !testSendAll
                              ? 'bg-yellow-500 text-white'
                              : 'text-yellow-700 hover:bg-yellow-100'
                          } disabled:opacity-50`}
                        >
                          Just 1 Email
                        </button>
                        <button
                          onClick={() => setTestSendAll(true)}
                          disabled={sendingBatchId !== null}
                          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                            testSendAll
                              ? 'bg-yellow-500 text-white'
                              : 'text-yellow-700 hover:bg-yellow-100'
                          } disabled:opacity-50`}
                        >
                          All {selectedListings.length} Emails
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handleSendTestNow}
                      disabled={sendingBatchId !== null || !calculatedPeriod}
                      className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sendingBatchId?.startsWith('temp-') ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {sendingBatchId?.startsWith('temp-') ? 'Sending...' : 'Send Test Now'}
                    </button>
                  </div>

                  {/* Progress Bar for Test Send */}
                  {sendingBatchId?.startsWith('temp-') && sendProgress && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-yellow-800">{sendProgress.status}</span>
                        <span className="text-sm text-yellow-700">
                          {sendProgress.current}/{sendProgress.total} ({Math.round((sendProgress.current / sendProgress.total) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-yellow-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-600 transition-all duration-300 ease-out"
                          style={{ width: `${Math.round((sendProgress.current / sendProgress.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {!sendingBatchId?.startsWith('temp-') && (
                    <p className="mt-2 text-sm text-yellow-700">
                      {testSendAll
                        ? `All ${selectedListings.length} emails will be sent to ${testEmail}`
                        : `Only 1 test email will be sent to ${testEmail} (others will be skipped)`
                      }
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Send Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              onClick={handleScheduleEmails}
              disabled={selectedListings.length === 0 || !scheduledDate || (!calculatedPeriod && !useCustomPeriod)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Calendar className="w-4 h-4" />
              Add {selectedListings.length} to Pending Queue
            </button>
          </div>
        )}

        {/* Announcement Section */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg shadow-sm border border-purple-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Megaphone className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Send Announcement</h2>
                <p className="text-sm text-gray-500">Send a custom email to all property owners</p>
              </div>
            </div>
            <button
              onClick={() => setShowAnnouncementModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Megaphone className="w-4 h-4" />
              New Announcement
            </button>
          </div>
        </div>

        {/* Email History Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-gray-500" />
              <span className="font-medium text-gray-700">Email History</span>
              {emailStats && (
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                    {emailStats.sent} sent
                  </span>
                  {emailStats.failed > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                      {emailStats.failed} failed
                    </span>
                  )}
                  {emailStats.pending > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                      {emailStats.pending} pending
                    </span>
                  )}
                </div>
              )}
            </div>
            {showHistory ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showHistory && (
            <div className="px-4 pb-4 border-t border-gray-100">
              {/* Stats Cards */}
              {emailStats && (
                <div className="grid grid-cols-4 gap-4 mt-4 mb-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-700">{emailStats.sent}</div>
                    <div className="text-xs text-green-600">Sent</div>
                  </div>
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-700">{emailStats.failed}</div>
                    <div className="text-xs text-red-600">Failed</div>
                  </div>
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                    <div className="text-2xl font-bold text-yellow-700">{emailStats.pending}</div>
                    <div className="text-xs text-yellow-600">Pending</div>
                  </div>
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-center">
                    <div className="text-2xl font-bold text-orange-700">{emailStats.bounced}</div>
                    <div className="text-xs text-orange-600">Bounced</div>
                  </div>
                </div>
              )}

              {/* Filters Row - Full Width */}
              <div className="flex items-center gap-3 mb-4">
                {/* Status Filter */}
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  {(['all', 'sent', 'failed', 'pending'] as const).map(status => (
                    <button
                      key={status}
                      onClick={() => setHistoryFilter(status)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
                        historyFilter === status
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                {/* Search - Flexible Width */}
                <input
                  type="text"
                  placeholder="Search..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="flex-1 h-9 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />

                {/* Date Range */}
                <input
                  type="date"
                  value={historyDateStart}
                  onChange={(e) => setHistoryDateStart(e.target.value)}
                  className="h-9 px-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="text-gray-400">–</span>
                <input
                  type="date"
                  value={historyDateEnd}
                  onChange={(e) => setHistoryDateEnd(e.target.value)}
                  className="h-9 px-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />

                {/* Clear */}
                {(historySearch || historyDateStart || historyDateEnd) && (
                  <button
                    onClick={() => {
                      setHistorySearch('');
                      setHistoryDateStart('');
                      setHistoryDateEnd('');
                    }}
                    className="h-9 px-3 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg font-medium transition-colors"
                  >
                    Clear
                  </button>
                )}

                {/* Refresh */}
                <button
                  onClick={fetchEmailHistory}
                  disabled={historyLoading}
                  className="h-9 flex items-center gap-2 px-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {/* Email Logs List */}
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredEmailLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {emailLogs.length === 0 ? 'No email logs found' : 'No results match your search'}
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredEmailLogs.map(log => (
                    <div
                      key={log.id}
                      className={`p-3 rounded-lg border ${
                        log.status === 'sent' ? 'bg-green-50 border-green-200' :
                        log.status === 'failed' ? 'bg-red-50 border-red-200' :
                        log.status === 'pending' ? 'bg-yellow-50 border-yellow-200' :
                        'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`p-1.5 rounded-full ${
                            log.status === 'sent' ? 'bg-green-100' :
                            log.status === 'failed' ? 'bg-red-100' :
                            log.status === 'pending' ? 'bg-yellow-100' :
                            'bg-gray-100'
                          }`}>
                            {log.status === 'sent' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                             log.status === 'failed' ? <XCircle className="w-4 h-4 text-red-600" /> :
                             <AlertCircle className="w-4 h-4 text-yellow-600" />}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 text-sm">
                              {log.propertyName || `Statement #${log.statementId}`}
                            </div>
                            <div className="text-xs text-gray-500">
                              To: {log.recipientEmail || <span className="text-red-500">No email configured</span>}
                            </div>
                            {log.frequencyTag && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                Tag: {log.frequencyTag}
                              </div>
                            )}
                            {log.errorMessage && (
                              <div className="text-xs text-red-600 mt-1">
                                Error: {log.errorMessage}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            log.status === 'sent' ? 'bg-green-100 text-green-700' :
                            log.status === 'failed' ? 'bg-red-100 text-red-700' :
                            log.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {log.status}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {log.sentAt ? new Date(log.sentAt).toLocaleString() :
                             log.attemptedAt ? new Date(log.attemptedAt).toLocaleString() :
                             new Date(log.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Email Templates Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-gray-500" />
              <span className="font-medium text-gray-700">Email Templates</span>
              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                {templates.length} templates
              </span>
            </div>
            {showTemplates ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showTemplates && (
            <div className="px-4 pb-4 border-t border-gray-100">
              {/* Add New Template Button */}
              <div className="flex items-center justify-between mt-4 mb-4">
                <p className="text-sm text-gray-500">Customize email templates for different frequency types</p>
                <button
                  onClick={() => openTemplateEditor()}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Template
                </button>
              </div>

              {/* Templates List */}
              {templatesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No templates found. Create your first template.
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map(template => (
                    <div
                      key={template.id}
                      className={`p-4 rounded-lg border ${
                        template.isDefault ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{template.name}</span>
                            {template.isDefault && (
                              <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                <Star className="w-3 h-3" />
                                Default
                              </span>
                            )}
                            {template.calculationType && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                template.calculationType === 'checkout' ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700'
                              }`}>
                                {template.calculationType === 'checkout' ? 'Check-Out' : 'Calendar'}
                              </span>
                            )}
                            {!template.isActive && (
                              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            Subject: {template.subject}
                          </div>
                          {template.description && (
                            <div className="text-xs text-gray-400 mt-1">
                              {template.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-4">
                          {!template.isDefault && !template.isSystem && (
                            <button
                              onClick={() => handleSetDefault(template.id)}
                              className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                              title="Set as Default"
                            >
                              <Star className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openTemplateEditor(template)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {!template.isSystem && !template.isDefault && (
                            <button
                              onClick={() => handleDeleteTemplate(template.id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Template Editor Modal */}
        {showTemplateEditor && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-[90vw] w-full max-h-[85vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingTemplate ? 'Edit Template' : 'New Template'}
                </h3>
                <button
                  onClick={() => {
                    setShowTemplateEditor(false);
                    setEditingTemplate(null);
                    setTemplatePreview(null);
                    setNewTemplate({ name: '', frequencyType: 'custom', tags: [], subject: '', htmlBody: '', textBody: '', description: '', isDefault: false });
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-3 gap-6">
                  {/* Left Column - Form (2/3 width) */}
                  <div className="col-span-2 space-y-4">
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                        <input
                          type="text"
                          value={newTemplate.name}
                          onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                          placeholder="e.g., Check-Out Statement"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <label className="flex items-center gap-2 px-4 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newTemplate.isDefault}
                          onChange={(e) => setNewTemplate({ ...newTemplate, isDefault: e.target.checked })}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="flex items-center gap-1 text-sm font-medium text-gray-700">
                          <Star className="w-4 h-4 text-yellow-500" />
                          Set as Default
                        </span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                      <input
                        type="text"
                        value={newTemplate.subject}
                        onChange={(e) => setNewTemplate({ ...newTemplate, subject: e.target.value })}
                        placeholder="e.g., Owner Statement - {{periodDisplay}}"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">HTML Body</label>
                      <textarea
                        value={newTemplate.htmlBody}
                        onChange={(e) => setNewTemplate({ ...newTemplate, htmlBody: e.target.value })}
                        rows={12}
                        placeholder="Enter HTML email template..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Plain Text Body (optional)</label>
                      <textarea
                        value={newTemplate.textBody}
                        onChange={(e) => setNewTemplate({ ...newTemplate, textBody: e.target.value })}
                        rows={4}
                        placeholder="Plain text version for email clients that don't support HTML..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                      <input
                        type="text"
                        value={newTemplate.description}
                        onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                        placeholder="Brief description of this template"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Right Column - Variables & Preview (1/3 width) */}
                  <div className="space-y-4 sticky top-0">
                    {/* Available Variables */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Available Variables</h4>
                      <p className="text-xs text-gray-500 mb-3">Click to insert into HTML body</p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {['owner', 'property', 'period', 'amount', 'status', 'general'].map(category => {
                          const categoryVars = templateVariables.filter(v => v.category === category);
                          if (categoryVars.length === 0) return null;
                          return (
                            <div key={category}>
                              <div className="text-xs font-medium text-gray-500 uppercase mb-1">{category}</div>
                              <div className="flex flex-wrap gap-1">
                                {categoryVars.map(variable => (
                                  <button
                                    key={variable.name}
                                    onClick={() => insertVariable(variable.name)}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
                                    title={variable.description}
                                  >
                                    <Copy className="w-3 h-3" />
                                    {`{{${variable.name}}}`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Preview Button */}
                    <button
                      onClick={handlePreviewTemplate}
                      disabled={!newTemplate.subject || !newTemplate.htmlBody}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Preview with Sample Data
                    </button>

                    {/* Preview Display */}
                    {templatePreview && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Preview</h4>
                        <div className="bg-white border border-gray-200 rounded-lg p-3">
                          <div className="text-sm font-medium text-gray-900 mb-2 pb-2 border-b border-gray-100">
                            Subject: {templatePreview.subject}
                          </div>
                          <div
                            className="text-sm prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: templatePreview.htmlBody }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowTemplateEditor(false);
                    setEditingTemplate(null);
                    setTemplatePreview(null);
                    setNewTemplate({ name: '', frequencyType: 'custom', tags: [], subject: '', htmlBody: '', textBody: '', description: '', isDefault: false });
                  }}
                  className="px-4 py-2 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTemplate}
                  disabled={!newTemplate.name || !newTemplate.subject || !newTemplate.htmlBody}
                  className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {editingTemplate ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pending Scheduled Batches */}
        {pendingBatches.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Pending Scheduled Emails</h2>
                <p className="text-sm text-gray-500">{pendingBatches.length} batch{pendingBatches.length !== 1 ? 'es' : ''} waiting to be sent</p>
              </div>
            </div>

            <div className="space-y-3">
              {pendingBatches.map(batch => {
                const { date, time } = formatScheduledDate(batch.scheduledDate, batch.scheduledTime);
                const isSending = sendingBatchId === batch.id;
                const progressPercent = sendProgress ? Math.round((sendProgress.current / sendProgress.total) * 100) : 0;

                return (
                  <div
                    key={batch.id}
                    className={`p-4 border rounded-lg ${isSending ? 'bg-blue-50 border-blue-300' : 'bg-purple-50 border-purple-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${isSending ? 'bg-blue-100' : 'bg-purple-100'}`}>
                          {isSending ? (
                            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Clock className="w-5 h-5 text-purple-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900">
                              {batch.listingIds.length} listing{batch.listingIds.length !== 1 ? 's' : ''}
                            </span>
                            <span className="text-gray-400">·</span>
                            <span className="text-sm text-gray-600">
                              {batch.tags.join(', ')}
                            </span>
                            {batch.listingsToGenerate > 0 && !isSending && (
                              <>
                                <span className="text-gray-400">·</span>
                                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                                  {batch.listingsToGenerate} to generate
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                            <span>Period: {new Date(batch.periodStart).toLocaleDateString()} - {new Date(batch.periodEnd).toLocaleDateString()}</span>
                            <span className="text-gray-300">|</span>
                            <span className="capitalize">{batch.calculationType}</span>
                          </div>
                          {!isSending && (
                            <div className="flex items-center gap-2 mt-1">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-sm text-gray-500">
                                Send: {date} at {time}
                              </span>
                            </div>
                          )}
                          {batch.testEmail && (
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                                Test: {batch.testEmail}
                              </span>
                              <span className="text-xs px-2 py-0.5 bg-yellow-50 text-yellow-600 rounded-full border border-yellow-200">
                                {batch.testSendAll ? `All ${batch.listingIds.length}` : 'Just 1'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {!isSending && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSendBatchNow(batch.id)}
                            disabled={sendingBatchId !== null}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Send Now
                          </button>
                          <button
                            onClick={() => removeBatch(batch.id)}
                            disabled={sendingBatchId !== null}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {isSending && sendProgress && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-blue-700">{sendProgress.status}</span>
                          <span className="text-sm text-blue-600">{sendProgress.current}/{sendProgress.total} ({progressPercent}%)</span>
                        </div>
                        <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 transition-all duration-300 ease-out"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Announcement Modal */}
        {showAnnouncementModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50">
                <div className="flex items-center gap-3">
                  <Megaphone className="w-6 h-6 text-purple-600" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Send Announcement</h2>
                    <p className="text-sm text-gray-500">Compose and send email to property owners</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAnnouncementPreview(!showAnnouncementPreview)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      showAnnouncementPreview
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                    Preview
                  </button>
                  <button
                    onClick={() => setShowAnnouncementModal(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {/* Recipients Section */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Recipients</label>
                    <div className="flex items-center gap-4 mb-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={announcementSendToAll}
                          onChange={() => setAnnouncementSendToAll(true)}
                          className="w-4 h-4 text-purple-600"
                        />
                        <span className="text-sm text-gray-700">All owners with email</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={!announcementSendToAll}
                          onChange={() => setAnnouncementSendToAll(false)}
                          className="w-4 h-4 text-purple-600"
                        />
                        <span className="text-sm text-gray-700">Selected tags only</span>
                      </label>
                    </div>

                    {!announcementSendToAll && (
                      <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
                        {availableTags.map(tag => (
                          <button
                            key={tag}
                            onClick={() => toggleAnnouncementTag(tag)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              announcementTags.has(tag)
                                ? 'bg-purple-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:border-purple-300'
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                      <Users className="w-4 h-4" />
                      <span>{announcementRecipientCount} recipient{announcementRecipientCount !== 1 ? 's' : ''} will receive this email</span>
                    </div>

                    {/* Retry Failed & Rate Limiting Options */}
                    <div className="flex flex-wrap items-center gap-4 mt-3 p-3 bg-gray-50 rounded-lg">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={announcementRetryFailed}
                          onChange={(e) => setAnnouncementRetryFailed(e.target.checked)}
                          className="w-4 h-4 text-purple-600 rounded"
                        />
                        <span className="text-sm text-gray-700">Retry failed only</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-700">Rate limit:</label>
                        <select
                          value={announcementRateLimit}
                          onChange={(e) => setAnnouncementRateLimit(Number(e.target.value))}
                          className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        >
                          <option value={0}>No delay</option>
                          <option value={500}>0.5 sec/email</option>
                          <option value={1000}>1 sec/email</option>
                          <option value={2000}>2 sec/email</option>
                          <option value={3000}>3 sec/email</option>
                          <option value={5000}>5 sec/email</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">Subject</label>
                      <button
                        type="button"
                        onClick={() => setAnnouncementSubject(prev => prev + '{{ownerGreeting}}')}
                        className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                        title="Insert Owner Name variable"
                      >
                        + Owner Name
                      </button>
                    </div>
                    <input
                      type="text"
                      value={announcementSubject}
                      onChange={(e) => setAnnouncementSubject(e.target.value)}
                      placeholder="Enter email subject... (use {{ownerGreeting}} for personalization)"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>

                  {/* Message Body - Simple Editor */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                    <textarea
                      id="announcement-body"
                      value={announcementBody}
                      onChange={(e) => {
                        setAnnouncementBody(e.target.value);
                        setAnnouncementCursorPos(e.target.selectionStart || 0);
                      }}
                      onSelect={handleBodyCursorChange}
                      onClick={handleBodyCursorChange}
                      onKeyUp={handleBodyCursorChange}
                      placeholder="Type your message here..."
                      className="w-full px-4 py-3 min-h-[220px] border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                    />
                    {/* Simple toolbar at bottom like Gmail */}
                    <div className="flex items-center gap-2 mt-2">
                      <label className="p-2 hover:bg-gray-100 rounded cursor-pointer" title="Attach Image (max 500KB)">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 500000) {
                                showToast('Image must be under 500KB. Please resize or compress your image.', 'error');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                const base64 = event.target?.result as string;
                                // Generate unique ID for image
                                const imageId = Date.now().toString();
                                // Store image in state
                                setAnnouncementImages(prev => new Map(prev).set(imageId, base64));
                                // Insert placeholder at tracked cursor position
                                const cursorPos = announcementCursorPos;
                                const before = announcementBody.substring(0, cursorPos);
                                const after = announcementBody.substring(cursorPos);
                                const newBody = before + `[IMAGE:${imageId}]` + after;
                                setAnnouncementBody(newBody);
                                // Update cursor position after the inserted placeholder
                                setAnnouncementCursorPos(cursorPos + `[IMAGE:${imageId}]`.length);
                                showToast('Image inserted at cursor position', 'success');
                              };
                              reader.readAsDataURL(file);
                            }
                            e.target.value = '';
                          }}
                        />
                        <Image className="w-5 h-5 text-gray-500" />
                      </label>
                      <span className="text-xs text-gray-400">max 500KB</span>
                      <button
                        type="button"
                        onClick={() => {
                          const url = prompt('Enter link URL:');
                          if (url) {
                            setAnnouncementBody(prev => prev + url);
                          }
                        }}
                        className="p-2 hover:bg-gray-100 rounded"
                        title="Insert Link"
                      >
                        <Link2 className="w-5 h-5 text-gray-500" />
                      </button>
                      <div className="flex-1" />
                      <button
                        type="button"
                        onClick={() => {
                          const textarea = document.getElementById('announcement-body') as HTMLTextAreaElement;
                          const cursorPos = textarea?.selectionStart ?? announcementBody.length;
                          const before = announcementBody.substring(0, cursorPos);
                          const after = announcementBody.substring(cursorPos);
                          setAnnouncementBody(before + '{{ownerGreeting}}' + after);
                          // Restore focus to textarea
                          setTimeout(() => {
                            textarea?.focus();
                            const newPos = cursorPos + '{{ownerGreeting}}'.length;
                            textarea?.setSelectionRange(newPos, newPos);
                          }, 0);
                        }}
                        className="px-3 py-1 text-xs bg-purple-50 text-purple-600 rounded hover:bg-purple-100"
                      >
                        + Owner Name
                      </button>
                    </div>
                  </div>

                  {/* Test Email Section */}
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <label className="block text-sm font-medium text-yellow-800 mb-2">
                      Send Test Email
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        value={announcementTestEmail}
                        onChange={(e) => setAnnouncementTestEmail(e.target.value)}
                        placeholder="Enter test email address..."
                        className="flex-1 px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white"
                      />
                      <button
                        onClick={() => handleSendAnnouncement(true)}
                        disabled={announcementTestSending || announcementSending || !announcementTestEmail.trim() || !announcementSubject.trim() || !announcementBody.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {announcementTestSending ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Send Test
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-yellow-700 mt-1">
                      Test email will include [TEST] prefix in subject
                    </p>
                  </div>

                  {/* Preview Section */}
                  {showAnnouncementPreview && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 border-b">
                        Email Preview
                      </div>
                      <div className="px-4 py-2 bg-gray-50 border-b text-sm space-y-1">
                        <div>
                          <span className="text-gray-500">To: </span>
                          <span className="text-gray-700">
                            {announcementRecipientCount} recipient{announcementRecipientCount !== 1 ? 's' : ''}
                            {!announcementSendToAll && announcementTags.size > 0 && (
                              <span className="text-purple-600 ml-1">
                                ({Array.from(announcementTags).join(', ')})
                              </span>
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Subject: </span>
                          <span className="font-medium">
                            {announcementSubject
                              ? announcementSubject.replace(/{{ownerGreeting}}/g, 'John')
                              : '(No subject)'}
                          </span>
                        </div>
                      </div>
                      <div className="p-4 bg-white" style={{ fontFamily: 'Arial, sans-serif', lineHeight: '1.5', color: '#333' }}>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: announcementBody
                              ? replaceImagePlaceholders(announcementBody)
                                  .replace(/\n/g, '<br/>')
                                  .replace(/{{ownerGreeting}}/g, '<span style="background:#e9d5ff;padding:0 4px;border-radius:2px;">John</span>')
                              : '<span style="color:#999;font-style:italic;">Your message will appear here...</span>'
                          }}
                        />
                        <div style={{ marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '15px' }}>
                          <p style={{ margin: 0, fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                            This is an auto-generated email. If you have any questions or need clarification, feel free to reply directly to this email, and our team will get back to you as soon as possible.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowAnnouncementModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSendAnnouncement(false)}
                  disabled={announcementSending || announcementTestSending || announcementRecipientCount === 0 || !announcementSubject.trim() || !announcementBody.trim()}
                  className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {announcementSending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send to {announcementRecipientCount} recipient{announcementRecipientCount !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailDashboard;
