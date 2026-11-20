package domain

import "fmt"

// MLError — ошибка вызова ML с кодом из контракта. Message безопасен для
// пользователя и попадает в задачу; Err хранит техническую причину для логов.
type MLError struct {
	Code      MLErrorCode
	Message   string
	Retryable bool
	Err       error
}

func (e *MLError) Error() string {
	msg := e.Message
	if msg == "" {
		msg = "ml call failed"
	}
	if e.Err != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, msg, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Code, msg)
}

func (e *MLError) Unwrap() error { return e.Err }
