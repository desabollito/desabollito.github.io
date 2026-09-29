angular
	.module('app.validation', [])
	//Http Interceptor para capturar los BadRequest que vuelvan de POSTs o PUTs al server 
	.factory('validationInterceptor', ['$rootScope', '$q', function ($rootScope, $q) {
	    var interceptor = {
	        responseError: function (response) {
	            if (response.status === 400 && response.data.ModelState) { //Dispara evento con errores del ModelState para atraparlos donde sea necesario
	                //var $scope = $injector.get('$scope');
	                $rootScope.$broadcast('validationInterceptor-detected', response.data.ModelState);
	            }
	            return $q.reject(response);
	        }
	    }
	    return interceptor;
	}])
	.config(['$httpProvider', function ($httpProvider) {
	    $httpProvider.interceptors.push('validationInterceptor');
	}])
	.directive('showErrors', ['$timeout', 'showErrorsConfig', '$window', function ($timeout, showErrorsConfig, $window) {
	    var getShowSuccess = function (options) {
	        var showSuccess;
	        showSuccess = showErrorsConfig.showSuccess;
	        if (options && options.showSuccess !== null) {
	            showSuccess = options.showSuccess;
	        }
	        return showSuccess;
	    };
	    var linkFn = function (scope, el, attrs, formCtrl) {
	        var toggleClasses;
	        var blurred = false;
	        var options = scope.$eval(attrs.showErrors);
	        var showSuccess = getShowSuccess(options);
	        var serverField = options.serverField;
	        var inputElements = Array.prototype.slice.call(el[0].querySelectorAll('[name]'));
	        //Si el nombre del formulario está separado por varios puntos (controller.formName o controller.parentFormName.formName), entonces toma siempre el último nombre
	        var elFormName = formCtrl.$name.split('.').length > 1 ? formCtrl.$name.split('.')[formCtrl.$name.split('.').length - 1] : formCtrl.$name;
	        inputElements.forEach(function (inputEl) {
	            var inputNgEl = angular.element(inputEl);
	            //var inputName = inputNgEl.attr('name');
	            if (!inputNgEl.attr('name')) {
	                throw 'show-errors element has no child input elements with a \'name\' attribute';
	            }
	            inputNgEl.bind('blur', function () {
	                blurred = true;
	                return toggleClasses(formCtrl[inputNgEl.attr('name')].$invalid);
	            });
	            scope.$watch(function () {
	                return formCtrl[inputNgEl.attr('name')] && formCtrl[inputNgEl.attr('name')].$invalid;
	            }, function (invalid) {
	                if (!blurred) {
	                    return;
	                }
	                return toggleClasses(invalid);
	            });
	            //Atrapa el evento disparado por el interceptor y setea validez del campo y mensajes de error a mostrar
	            scope.$on('validationInterceptor-detected', function (event, modelState) {
	                if (serverField) {
	                    formCtrl[inputNgEl.attr('name')].$setValidity('serverValidation', !modelState[serverField]);
	                    formCtrl[inputNgEl.attr('name')].serverErrors = !!modelState[serverField] ? modelState[serverField] : [];
	                    toggleClasses(formCtrl[inputNgEl.attr('name')].$invalid);
	                }
	            });

	            scope.$on('show-errors-check-validity', function (event, formName) {
	                if (serverField) //Limpia errores de validacion del server para revalidar desde cero
	                    formCtrl[inputNgEl.attr('name')].$setValidity('serverValidation', true);

	                if (elFormName === formName) {
	                    var tc = formCtrl[inputNgEl.attr('name')].$invalid;
	                    //COMENTADO PORQUE SCROLEA EL FORM CUANDO NO HAY VALIDATION SUMMARY.
	                    //SE PASO A registerInterceptorValidationSummary($scope, vm, $window)
	                    //if (tc) $window.scrollTo(0, 0);
	                    return toggleClasses(tc);
	                }
	            });
	        });

	        scope.$on('show-errors-reset', function (formName) {
	            return $timeout(function () {
	                if (elFormName === formName)
	                    el.removeClass('has-error');
	                el.removeClass('has-success');
	                return blurred === false;
	            }, 0, false);
	        });
	        return toggleClasses = function (invalid) {
	            el.toggleClass('has-error', invalid);
	            if (showSuccess) {
	                return el.toggleClass('has-success', !invalid);
	            }
	        };
	    };
	    return {
	        restrict: 'A',
	        require: '^form',
	        compile: function (elem, attrs) {
	            if (!elem.hasClass('form-group')) {
	                throw 'show-errors element does not have the \'form-group\' class';
	            }
	            return linkFn;
	        }
	    };
	}])
	.provider('showErrorsConfig', function () {
	    var _showSuccess = false;
	    this.showSuccess = function (showSuccess) {
	        return _showSuccess === showSuccess;
	    };
	    this.$get = function () {
	        return { showSuccess: _showSuccess };
	    };
	});