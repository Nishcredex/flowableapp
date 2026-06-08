import React from 'react';
import {
  ArrowLeftIcon,
  Trash2Icon,
  MailIcon,
  MoreVerticalIcon,
  PrinterIcon,
  ExternalLinkIcon,
  StarIcon,
  CornerUpLeftIcon,
  CornerUpRightIcon } from
'lucide-react';
import { useNavigate } from 'react-router-dom';
export function EmailReminder() {
  const navigate = useNavigate();
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Gmail Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              
              <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 bg-white rounded">
                <svg viewBox="0 0 24 24" className="w-6 h-6">
                  <path
                    d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
                    fill="#EA4335" />
                  
                </svg>
              </div>
              <span className="text-xl font-medium text-gray-600">Gmail</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <Trash2Icon className="w-5 h-5 text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <MailIcon className="w-5 h-5 text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <MoreVerticalIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Email Content */}
        <div className="p-8">
          <div className="flex items-start justify-between mb-8">
            <h1 className="text-2xl font-normal text-gray-900">
              Reminder: Task Pending - Machinery Calibration & Maintenance
              Review
            </h1>
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <PrinterIcon className="w-5 h-5 text-gray-600" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <ExternalLinkIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>

          <div className="flex items-start gap-4 mb-8">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-gray-600 font-medium">FA</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900">
                    JK Copier Audit System
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    &lt;noreply@jkcopier.com&gt;
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">
                    10:15 AM (2 minutes ago)
                  </span>
                  <button className="text-gray-400 hover:text-gray-600">
                    <StarIcon className="w-5 h-5" />
                  </button>
                  <button className="text-gray-400 hover:text-gray-600">
                    <CornerUpLeftIcon className="w-5 h-5" />
                  </button>
                  <button className="text-gray-400 hover:text-gray-600">
                    <MoreVerticalIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="text-sm text-gray-500 mt-0.5">
                to: rajesh.kumar@jkcopier.com ▾
              </div>
            </div>
          </div>

          <div className="pl-14 text-gray-800 space-y-4">
            <p>Hi Rajesh,</p>
            <p>This is a reminder that the following task is pending:</p>

            <ul className="list-disc pl-8 space-y-2 my-4">
              <li>
                <strong>Task:</strong> Rectify Calibration Drift on PM-2
              </li>
              <li>
                <strong>Audit:</strong> Q2 Manufacturing Compliance Audit - Unit
                1
              </li>
              <li>
                <strong>Project:</strong> Copier Paper Production - Unit 1
              </li>
              <li>
                <strong>Due Date:</strong> 25-May-2024
              </li>
            </ul>

            <p>Please log in to the system and complete the task.</p>

            <div className="pt-4">
              <p>Thank you,</p>
              <p className="font-bold">Audit System</p>
            </div>

            <div className="flex items-center gap-3 mt-8 pt-4">
              <button className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700">
                <CornerUpLeftIcon className="w-4 h-4" />
                Reply
              </button>
              <button className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700">
                <CornerUpRightIcon className="w-4 h-4" />
                Forward
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>);

}